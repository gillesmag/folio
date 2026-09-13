import Foundation
import Observation

/// The document list: cached copy first, then the network.
@MainActor
@Observable
final class DocumentsStore {
    private(set) var documents: [DocumentSummary] = []
    private(set) var isLoading = false
    private(set) var hasLoaded = false
    var refreshError: String?

    private let client: FolioClient

    init(client: FolioClient) {
        self.client = client
        if let cached = DocumentCache.readList() {
            documents = cached
            hasLoaded = true
        }
    }

    func refresh() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let list = try await client.documents().sorted { $0.updatedAt > $1.updatedAt }
            documents = list
            hasLoaded = true
            refreshError = nil
            DocumentCache.writeList(list)
        } catch APIError.unauthorized {
            // The auth session handles this.
        } catch {
            refreshError = error.localizedDescription
            hasLoaded = true
        }
    }

    func summary(for id: String) -> DocumentSummary? {
        documents.first { $0.id == id }
    }
}
