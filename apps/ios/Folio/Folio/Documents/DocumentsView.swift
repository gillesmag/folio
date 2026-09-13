import SwiftUI

struct DocumentsView: View {
    @Environment(AuthSession.self) private var auth
    @Environment(Router.self) private var router
    @State private var store: DocumentsStore?
    @State private var query = ""

    var body: some View {
        @Bindable var router = router
        NavigationStack(path: $router.path) {
            Group {
                if let store {
                    list(store)
                } else {
                    ProgressView()
                }
            }
            .navigationTitle("Folio")
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .document(let id):
                    ReaderView(id: id, summary: store?.summary(for: id))
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        router.showSettings = true
                    } label: {
                        AvatarView(user: auth.user, size: 28)
                    }
                    .accessibilityLabel("Settings")
                }
            }
            .sheet(isPresented: $router.showSettings) {
                SettingsView()
            }
        }
        .task {
            if store == nil { store = DocumentsStore(client: auth.client) }
            await store?.refresh()
        }
    }

    @ViewBuilder
    private func list(_ store: DocumentsStore) -> some View {
        let filtered = filtered(store.documents)
        List(filtered) { document in
            NavigationLink(value: Route.document(document.id)) {
                DocumentRow(document: document)
            }
            .swipeActions(edge: .leading, allowsFullSwipe: true) {
                Button {
                    UIPasteboard.general.url = auth.client.webURL(for: document.id)
                } label: {
                    Label("Copy link", systemImage: "link")
                }
                .tint(.accentColor)
            }
        }
        .listStyle(.plain)
        .searchable(text: $query, prompt: "Search documents")
        .searchToolbarBehavior(.minimize)
        .refreshable { await store.refresh() }
        .overlay {
            if store.documents.isEmpty && store.hasLoaded && query.isEmpty {
                ContentUnavailableView {
                    Label("No documents yet", systemImage: "doc.text")
                } description: {
                    Text("Push one from the terminal with `folio push report.md`.")
                }
            } else if filtered.isEmpty && !query.isEmpty {
                ContentUnavailableView.search(text: query)
            } else if store.documents.isEmpty && !store.hasLoaded {
                ProgressView()
            }
        }
        .safeAreaInset(edge: .bottom) {
            if let error = store.refreshError {
                HStack(spacing: 12) {
                    Image(systemName: "wifi.exclamationmark")
                    Text("Couldn't refresh")
                    Button("Retry") { Task { await store.refresh() } }
                        .fontWeight(.semibold)
                }
                .font(.subheadline)
                .padding(.horizontal, 18)
                .padding(.vertical, 12)
                .glassEffect(.regular.interactive(), in: .capsule)
                .padding(.bottom, 8)
                .accessibilityHint(error)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.default, value: store.refreshError)
    }

    private func filtered(_ documents: [DocumentSummary]) -> [DocumentSummary] {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return documents }
        return documents.filter { $0.title.localizedCaseInsensitiveContains(trimmed) }
    }
}

struct DocumentRow: View {
    let document: DocumentSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(document.title)
                .font(.headline)
                .lineLimit(2)
            HStack(spacing: 6) {
                Image(systemName: document.visibility.symbol)
                    .font(.caption2)
                    .accessibilityLabel(document.visibility.label)
                Text(RelativeDate.string(for: document.updatedAt))
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}

struct AvatarView: View {
    let user: User?
    var size: CGFloat = 32

    var body: some View {
        ZStack {
            Circle().fill(Color.accentColor.opacity(0.18))
            if let image = user?.image, let url = URL(string: image) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        initials
                    }
                }
            } else {
                initials
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var initials: some View {
        Text(initialsText)
            .font(.system(size: size * 0.42, weight: .semibold))
            .foregroundStyle(Color.accentColor)
    }

    private var initialsText: String {
        let parts = (user?.name ?? "").split(separator: " ").prefix(2)
        let letters = parts.compactMap { $0.first }.map(String.init).joined()
        return letters.isEmpty ? "?" : letters.uppercased()
    }
}

enum RelativeDate {
    static func string(for date: Date, now: Date = .now) -> String {
        let interval = now.timeIntervalSince(date)
        if interval < 60 { return "Just now" }
        if interval < 6 * 24 * 3600 {
            return date.formatted(.relative(presentation: .named)).capitalizedFirst
        }
        let sameYear = Calendar.current.isDate(date, equalTo: now, toGranularity: .year)
        return date.formatted(sameYear ? .dateTime.day().month(.abbreviated) : .dateTime.day().month(.abbreviated).year())
    }
}

extension String {
    var capitalizedFirst: String {
        guard let first else { return self }
        return first.uppercased() + dropFirst()
    }
}
