import Foundation

// Mirrors packages/contract. Kept nonisolated so decoding works from any context.

nonisolated enum Visibility: String, Codable, Sendable, CaseIterable {
    case `private`, unlisted, `public`

    var symbol: String {
        switch self {
        case .private: "lock"
        case .unlisted: "link"
        case .public: "globe"
        }
    }

    var label: String { rawValue.capitalized }
}

nonisolated struct User: Codable, Sendable, Equatable, Identifiable {
    let id: String
    let name: String
    let email: String
    let image: String?
}

nonisolated struct TocEntry: Codable, Sendable, Hashable, Identifiable {
    let depth: Int
    let id: String
    let text: String
}

nonisolated struct RenderMeta: Codable, Sendable {
    let toc: [TocEntry]
    let hasMath: Bool
    let hasMermaid: Bool
    let blockCount: Int
}

nonisolated struct DocumentSummary: Codable, Sendable, Hashable, Identifiable {
    let id: String
    let ownerId: String
    let title: String
    let visibility: Visibility
    let version: Int
    let createdAt: Date
    let updatedAt: Date
}

nonisolated struct Document: Codable, Sendable, Identifiable {
    let id: String
    let ownerId: String
    let title: String
    let visibility: Visibility
    let version: Int
    let createdAt: Date
    let updatedAt: Date
    let source: String
    let html: String
    let meta: RenderMeta

    var summary: DocumentSummary {
        DocumentSummary(
            id: id, ownerId: ownerId, title: title, visibility: visibility,
            version: version, createdAt: createdAt, updatedAt: updatedAt)
    }

    /// The document usually opens with the same h1 as its title; do not list it twice.
    var titleIsFirstHeading: Bool {
        guard let first = meta.toc.first else { return false }
        return first.depth == 1 && first.text == title
    }

    var contents: [TocEntry] {
        titleIsFirstHeading ? Array(meta.toc.dropFirst()) : meta.toc
    }
}

nonisolated struct Comment: Codable, Sendable, Hashable, Identifiable {
    let id: String
    let documentId: String
    let authorId: String
    let blockId: String?
    let body: String
    let resolved: Bool
    let createdAt: Date
    let updatedAt: Date
}

nonisolated struct CommentInput: Encodable, Sendable {
    let blockId: String?
    let body: String
}

nonisolated enum APIError: Error, LocalizedError, Sendable {
    case unauthorized
    case forbidden(String)
    case notFound
    case http(Int, String)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .unauthorized: "Your session has ended. Sign in again."
        case .forbidden(let message): message.isEmpty ? "You can't do that." : message
        case .notFound: "That document is gone."
        case .http(let status, let message): message.isEmpty ? "The server answered \(status)." : message
        case .invalidResponse: "The server sent something unexpected."
        }
    }
}

nonisolated enum JSON {
    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        let fractional = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
        let plain = Date.ISO8601FormatStyle()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            if let string = try? container.decode(String.self) {
                if let date = (try? fractional.parse(string)) ?? (try? plain.parse(string)) { return date }
            } else if let number = try? container.decode(Double.self) {
                // Epoch milliseconds, in case a model ever encodes that way.
                return Date(timeIntervalSince1970: number > 1e11 ? number / 1000 : number)
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unrecognised date")
        }
        return decoder
    }()

    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
}
