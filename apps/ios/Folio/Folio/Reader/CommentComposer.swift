import SwiftUI

/// The glass capsule above the keyboard while writing a comment.
struct CommentComposer: View {
    @Bindable var model: ReaderModel
    @FocusState private var focused: Bool
    @State private var posting = false

    var body: some View {
        VStack(spacing: 6) {
            if let error = model.commentError {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
            GlassEffectContainer(spacing: 10) {
                HStack(spacing: 10) {
                    TextField(placeholder, text: $model.draft, axis: .vertical)
                        .lineLimit(1...5)
                        .focused($focused)
                        .submitLabel(.return)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 11)
                        .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 22))

                    Button {
                        guard !posting else { return }
                        posting = true
                        Task {
                            await model.postComment()
                            posting = false
                        }
                    } label: {
                        Image(systemName: "arrow.up")
                            .font(.body.weight(.semibold))
                            .frame(width: 22, height: 22)
                    }
                    .buttonStyle(.glassProminent)
                    .disabled(model.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || posting)
                    .accessibilityLabel("Post")

                    Button {
                        model.draft = ""
                        model.commentError = nil
                        model.cancelComment()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.body.weight(.semibold))
                            .frame(width: 22, height: 22)
                    }
                    .buttonStyle(.glass)
                    .accessibilityLabel("Cancel")
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
        .onAppear { focused = true }
    }

    private var placeholder: String {
        model.anchor == nil ? "Comment on the document…" : "Comment on this paragraph…"
    }
}
