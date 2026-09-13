import Foundation

/// Talks to the web Worker origin, which proxies /api and /auth to the API Worker.
/// Everything runs on the main actor; URLSession does the waiting off it.
@MainActor
final class FolioClient {
    var origin: URL
    var token: String?
    /// Called when the server answers 401; the auth session uses it to sign out.
    var onUnauthorized: (@MainActor () -> Void)?

    private let session: URLSession

    init(origin: URL, token: String? = nil) {
        self.origin = origin
        self.token = token
        let config = URLSessionConfiguration.default
        config.httpAdditionalHeaders = ["User-Agent": "folio-ios/\(Bundle.main.shortVersion)"]
        config.timeoutIntervalForRequest = 20
        session = URLSession(configuration: config)
    }

    // MARK: Auth

    nonisolated struct SocialSignInResponse: Decodable, Sendable {
        let token: String
        let user: User
    }

    /// Exchanges a Google ID token for a Folio session token (Better Auth bearer plugin).
    func signInWithGoogle(idToken: String, accessToken: String?, nonce: String?) async throws -> SocialSignInResponse {
        var body: [String: Any] = ["provider": "google"]
        var id: [String: Any] = ["token": idToken]
        if let accessToken { id["accessToken"] = accessToken }
        if let nonce { id["nonce"] = nonce }
        body["idToken"] = id
        let data = try JSONSerialization.data(withJSONObject: body)
        let (payload, response) = try await send("POST", "/auth/sign-in/social", body: data, authenticated: false)
        var decoded = try JSON.decoder.decode(SocialSignInResponse.self, from: payload)
        // The bearer plugin also puts the signed token in a header; prefer it when present.
        if let header = response.value(forHTTPHeaderField: "set-auth-token"), !header.isEmpty {
            decoded = SocialSignInResponse(token: header, user: decoded.user)
        }
        return decoded
    }

    func signOut() async throws {
        _ = try await send("POST", "/auth/sign-out", body: Data("{}".utf8))
    }

    // MARK: API

    func me() async throws -> User {
        try await get("/api/me")
    }

    func documents() async throws -> [DocumentSummary] {
        try await get("/api/documents")
    }

    func document(_ id: String) async throws -> Document {
        try await get("/api/documents/\(id)")
    }

    func comments(documentId: String) async throws -> [Comment] {
        try await get("/api/documents/\(documentId)/comments")
    }

    func createComment(documentId: String, blockId: String?, body: String) async throws -> Comment {
        let payload = try JSON.encoder.encode(CommentInput(blockId: blockId, body: body))
        let (data, _) = try await send("POST", "/api/documents/\(documentId)/comments", body: payload)
        return try JSON.decoder.decode(Comment.self, from: data)
    }

    func setResolved(commentId: String, resolved: Bool) async throws -> Comment {
        let payload = try JSONSerialization.data(withJSONObject: ["resolved": resolved])
        let (data, _) = try await send("PATCH", "/api/comments/\(commentId)", body: payload)
        return try JSON.decoder.decode(Comment.self, from: data)
    }

    func deleteComment(commentId: String) async throws {
        _ = try await send("DELETE", "/api/comments/\(commentId)")
    }

    /// The web URL of a document, for sharing and for opening in Safari.
    func webURL(for documentId: String) -> URL {
        origin.appending(path: "d/\(documentId)")
    }

    // MARK: Transport

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let (data, _) = try await send("GET", path)
        do {
            return try JSON.decoder.decode(T.self, from: data)
        } catch {
            throw APIError.invalidResponse
        }
    }

    @discardableResult
    private func send(_ method: String, _ path: String, body: Data? = nil, authenticated: Bool = true) async throws -> (Data, HTTPURLResponse) {
        var request = URLRequest(url: URL(string: path, relativeTo: origin)!.absoluteURL)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if authenticated, let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        switch http.statusCode {
        case 200..<300:
            return (data, http)
        case 401:
            if authenticated { onUnauthorized?() }
            throw APIError.unauthorized
        case 403:
            throw APIError.forbidden(Self.message(in: data))
        case 404:
            throw APIError.notFound
        default:
            throw APIError.http(http.statusCode, Self.message(in: data))
        }
    }

    private nonisolated static func message(in data: Data) -> String {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return "" }
        return (object["message"] as? String) ?? (object["error"] as? String) ?? ""
    }
}

extension Bundle {
    var shortVersion: String {
        (infoDictionary?["CFBundleShortVersionString"] as? String) ?? "0"
    }

    var buildNumber: String {
        (infoDictionary?["CFBundleVersion"] as? String) ?? "0"
    }
}
