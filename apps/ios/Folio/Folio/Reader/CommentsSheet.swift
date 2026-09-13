import SwiftUI

struct CommentsSheet: View {
    @Bindable var model: ReaderModel
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthSession.self) private var auth
    @State private var filter: Filter = .open
    @State private var deleting: Comment?

    enum Filter: String, CaseIterable, Identifiable {
        case open = "Open", resolved = "Resolved", all = "All"
        var id: String { rawValue }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(shown) { comment in
                    row(comment)
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            if model.canModerate(comment) {
                                Button {
                                    Task { await model.setResolved(comment, !comment.resolved) }
                                } label: {
                                    Label(comment.resolved ? "Reopen" : "Resolve",
                                          systemImage: comment.resolved ? "arrow.uturn.backward" : "checkmark")
                                }
                                .tint(comment.resolved ? .orange : .green)
                            }
                            if model.canDelete(comment) {
                                Button(role: .destructive) {
                                    deleting = comment
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        }
                }
            }
            .listStyle(.plain)
            .overlay {
                if shown.isEmpty {
                    ContentUnavailableView {
                        Label(filter == .open ? "No open comments" : "No comments", systemImage: "bubble.left")
                    } description: {
                        Text(auth.user == nil ? "Sign in to comment." : "Tap a paragraph in the document to comment on it.")
                    }
                }
            }
            .navigationTitle("Comments · \(model.comments.count)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Picker("Filter", selection: $filter) {
                        ForEach(Filter.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .frame(maxWidth: 260)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                if auth.user != nil {
                    Button {
                        dismiss()
                        model.beginComment(on: nil)
                    } label: {
                        Label("New comment", systemImage: "plus")
                            .fontWeight(.semibold)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 4)
                    }
                    .buttonStyle(.glassProminent)
                    .padding(.bottom, 8)
                }
            }
            .confirmationDialog("Delete this comment?", isPresented: Binding(
                get: { deleting != nil }, set: { if !$0 { deleting = nil } }
            ), presenting: deleting) { comment in
                Button("Delete", role: .destructive) {
                    Task { await model.delete(comment) }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .task { await model.refreshComments() }
    }

    private var shown: [Comment] {
        switch filter {
        case .open: model.comments.filter { !$0.resolved }
        case .resolved: model.comments.filter(\.resolved)
        case .all: model.comments
        }
    }

    @ViewBuilder
    private func row(_ comment: Comment) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                if let block = comment.blockId {
                    Button {
                        model.scroll(to: block)
                        dismiss()
                    } label: {
                        Label("On a paragraph", systemImage: "arrow.turn.down.right")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Color.accentColor)
                } else {
                    Label("Whole document", systemImage: "doc.text")
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(RelativeDate.string(for: comment.createdAt))
                    .foregroundStyle(.tertiary)
            }
            .font(.caption)
            Text(comment.body)
                .font(.body)
                .textSelection(.enabled)
        }
        .padding(.vertical, 4)
        .opacity(comment.resolved ? 0.55 : 1)
    }
}
