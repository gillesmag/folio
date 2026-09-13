import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

/// Google sign-in without the SDK: the OAuth authorization-code flow with PKCE in an
/// ASWebAuthenticationSession, which shares Safari's cookies so an already signed-in
/// Google account is one tap. iOS client ids need no secret.
@MainActor
final class GoogleAuth: NSObject, ASWebAuthenticationPresentationContextProviding {
    nonisolated struct Tokens: Sendable {
        let idToken: String
        let accessToken: String?
        let nonce: String
    }

    enum Failure: LocalizedError {
        case notConfigured
        case cancelled
        case badCallback
        case exchange(String)

        var errorDescription: String? {
            switch self {
            case .notConfigured: "No Google client id is configured for this build."
            case .cancelled: "Sign-in was cancelled."
            case .badCallback: "Google didn't return an account. Try again."
            case .exchange(let message): "Google rejected the sign-in: \(message)"
            }
        }
    }

    /// From Info.plist. The reversed form is the redirect scheme Google expects for iOS clients.
    static var clientID: String? {
        let value = Bundle.main.object(forInfoDictionaryKey: "GoogleIOSClientID") as? String
        return (value?.isEmpty ?? true) ? nil : value
    }

    private var session: ASWebAuthenticationSession?

    func signIn() async throws -> Tokens {
        guard let clientID = Self.clientID else { throw Failure.notConfigured }
        let scheme = Self.reversed(clientID)
        let redirect = "\(scheme):/oauth2redirect"
        let verifier = Self.randomURLSafe(bytes: 32)
        let challenge = Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
        let state = Self.randomURLSafe(bytes: 16)
        let nonce = Self.randomURLSafe(bytes: 16)

        var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        components.queryItems = [
            .init(name: "client_id", value: clientID),
            .init(name: "redirect_uri", value: redirect),
            .init(name: "response_type", value: "code"),
            .init(name: "scope", value: "openid email profile"),
            .init(name: "code_challenge", value: challenge),
            .init(name: "code_challenge_method", value: "S256"),
            .init(name: "state", value: state),
            .init(name: "nonce", value: nonce),
        ]

        let callback: URL = try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: components.url!, callback: .customScheme(scheme)) { url, error in
                if let url {
                    continuation.resume(returning: url)
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    continuation.resume(throwing: Failure.cancelled)
                } else {
                    continuation.resume(throwing: error ?? Failure.badCallback)
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            session.start()
        }

        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard items.first(where: { $0.name == "state" })?.value == state,
              let code = items.first(where: { $0.name == "code" })?.value
        else { throw Failure.badCallback }

        var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = Self.form([
            "code": code,
            "client_id": clientID,
            "redirect_uri": redirect,
            "grant_type": "authorization_code",
            "code_verifier": verifier,
        ])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let idToken = object["id_token"] as? String
        else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error_description"] as? String
            throw Failure.exchange(message ?? "no id token")
        }
        return Tokens(idToken: idToken, accessToken: object["access_token"] as? String, nonce: nonce)
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow) { return window }
        return ASPresentationAnchor(windowScene: scenes.first!)
    }

    // MARK: Helpers

    /// "123-abc.apps.googleusercontent.com" -> "com.googleusercontent.apps.123-abc"
    nonisolated static func reversed(_ clientID: String) -> String {
        clientID.split(separator: ".").reversed().joined(separator: ".")
    }

    nonisolated private static func randomURLSafe(bytes: Int) -> String {
        var data = Data(count: bytes)
        _ = data.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, bytes, $0.baseAddress!) }
        return base64URL(data)
    }

    nonisolated private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    nonisolated private static func form(_ fields: [String: String]) -> Data {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return Data(fields.map { key, value in
            "\(key)=\(value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value)"
        }.joined(separator: "&").utf8)
    }
}
