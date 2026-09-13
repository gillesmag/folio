import SafariServices
import SwiftUI

struct ReaderView: View {
    let id: String
    let summary: DocumentSummary?

    @Environment(AuthSession.self) private var auth
    @Environment(Router.self) private var router
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var model: ReaderModel?

    var body: some View {
        Group {
            if let model {
                content(model)
            } else {
                Color.clear
            }
        }
        .task {
            if model == nil {
                model = ReaderModel(id: id, client: auth.client, currentUserId: auth.user?.id)
            }
            await model?.load(knownVersion: summary?.version)
            if let sheet = router.pendingSheet {
                router.pendingSheet = nil
                if sheet == .compose {
                    model?.beginComment(on: nil)
                } else {
                    model?.sheet = sheet
                }
            }
        }
    }

    @ViewBuilder
    private func content(_ model: ReaderModel) -> some View {
        @Bindable var model = model
        ZStack {
            if let document = model.document {
                DocumentWebView(
                    document: document, model: model, dark: colorScheme == .dark,
                    canComment: auth.user != nil, serverOrigin: auth.origin
                )
                .ignoresSafeArea()
            } else if let error = model.loadError {
                ContentUnavailableView {
                    Label("Couldn't open this document", systemImage: "doc.questionmark")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try again") { Task { await model.load(knownVersion: summary?.version) } }
                        .buttonStyle(.glass)
                }
            } else {
                ProgressView()
            }
        }
        .background(Color(.systemBackground))
        .navigationTitle(model.titleVisible ? "" : (model.document?.title ?? ""))
        .navigationBarTitleDisplayMode(.inline)
        .toolbarVisibility(model.barHidden ? .hidden : .visible, for: .navigationBar)
        .animation(.easeInOut(duration: 0.22), value: model.barHidden)
        .toolbar { toolbar(model) }
        .safeAreaInset(edge: .bottom) {
            if model.isComposing {
                CommentComposer(model: model)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: model.isComposing)
        .sheet(item: $model.sheet) { sheet in
            switch sheet {
            case .contents:
                ContentsSheet(model: model)
            case .comments:
                CommentsSheet(model: model)
            case .compose:
                EmptyView()
            }
        }
        .sheet(item: $model.externalURL) { item in
            SafariView(url: item.url).ignoresSafeArea()
        }
        .onChange(of: model.linkedDocument) { _, linked in
            if let linked {
                model.linkedDocument = nil
                router.path.append(.document(linked))
            }
        }
        .onChange(of: colorScheme) { _, scheme in
            model.applyTheme(dark: scheme == .dark)
        }
        .onChange(of: dynamicTypeSize) { _, _ in
            model.applyFontSize()
        }
    }

    @ToolbarContentBuilder
    private func toolbar(_ model: ReaderModel) -> some ToolbarContent {
        if let document = model.document, document.contents.count > 1 {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    model.sheet = .contents
                } label: {
                    Label("Contents", systemImage: "list.bullet")
                }
            }
        }
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                model.sheet = .comments
            } label: {
                Label("Comments", systemImage: "bubble.left")
            }
            .badge(model.openComments.count)
        }
        ToolbarSpacer(.fixed, placement: .topBarTrailing)
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                if auth.user != nil {
                    Button {
                        model.beginComment(on: nil)
                    } label: {
                        Label("Comment on document", systemImage: "text.bubble")
                    }
                }
                ShareLink(item: auth.client.webURL(for: id)) {
                    Label("Share link", systemImage: "square.and.arrow.up")
                }
                Button {
                    model.externalURL = IdentifiedURL(url: auth.client.webURL(for: id))
                } label: {
                    Label("Open in Safari", systemImage: "safari")
                }
                if let document = model.document {
                    Button {
                        UIPasteboard.general.string = document.source
                    } label: {
                        Label("Copy markdown", systemImage: "doc.on.doc")
                    }
                }
            } label: {
                Label("More", systemImage: "ellipsis")
            }
        }
    }
}

struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
