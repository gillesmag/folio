import SwiftUI

struct ContentsSheet: View {
    let model: ReaderModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                ForEach(entries) { entry in
                    Button {
                        model.scroll(to: entry.id)
                        dismiss()
                    } label: {
                        Text(entry.text)
                            .foregroundStyle(entry.id == model.activeHeading ? .primary : .secondary)
                            .fontWeight(entry.id == model.activeHeading ? .semibold : .regular)
                            .padding(.leading, CGFloat(max(0, entry.depth - baseDepth)) * 16)
                            .lineLimit(2)
                    }
                }
            }
            .listStyle(.plain)
            .navigationTitle("Contents")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var entries: [TocEntry] { model.document?.contents ?? [] }

    private var baseDepth: Int { entries.map(\.depth).min() ?? 1 }
}
