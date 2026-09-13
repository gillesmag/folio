import AuthenticationServices
import Foundation
import UIKit

/// RFC 8628 device flow against Better Auth's device-authorization plugin, the same path the
/// CLI uses. The approval page opens in an `ASWebAuthenticationSession`, where the user signs
/// in with Google through the web app's own OAuth client, so no iOS client id is needed.
/// The app polls for the token meanwhile and closes the sheet as soon as it arrives.
@MainActor
final class DeviceFlowAuth: NSObject, ASWebAuthenticationPresentationContextProviding {
    /// The server only lets its own clients start a device flow; the app presents itself as the
    /// CLI, which is what the approval page will name.
    static let clientID = "folio-cli"

    enum Failure: LocalizedError {
        case cancelled
        case denied
        case expired
        case server(String)

        var errorDescription: String? {
            switch self {
            case .cancelled: "Sign-in was cancelled."
            case .denied: "Sign-in was denied in the browser."
            case .expired: "The sign-in code expired. Try again."
            case .server(let message): message
            }
        }
    }

    nonisolated private struct DeviceCode: Decodable {
        let device_code: String
        let user_code: String
        let verification_uri: String
        let verification_uri_complete: String?
        let expires_in: Double
        let interval: Double?
    }

    nonisolated private struct TokenResponse: Decodable {
        let access_token: String?
        let error: String?
        let error_description: String?
    }

    private var session: ASWebAuthenticationSession?
    private var dismissed = false

    /// Returns the Folio session token.
    func signIn(origin: URL) async throws -> String {
        let code: DeviceCode = try await post(origin.appending(path: "auth/device/code"),
                                              ["client_id": Self.clientID])

        let page = URL(string: code.verification_uri_complete ?? code.verification_uri, relativeTo: origin)!.absoluteURL
        dismissed = false
        let session = ASWebAuthenticationSession(url: page, callback: .customScheme("folio")) { [weak self] _, _ in
            // Reached when the user closes the sheet; a successful poll cancels it from our side first.
            self?.dismissed = true
        }
        session.presentationContextProvider = self
        // Ephemeral: no "wants to use <host> to sign in" consent alert. The Google login
        // happens on the web app's page, and the resulting Folio token is what persists.
        session.prefersEphemeralWebBrowserSession = true
        self.session = session
        session.start()
        defer {
            session.cancel()
            self.session = nil
        }

        var interval = max(code.interval ?? 5, 1)
        let deadline = Date().addingTimeInterval(code.expires_in)
        while Date() < deadline {
            try await Task.sleep(for: .seconds(interval))
            if dismissed { throw Failure.cancelled }
            let token: TokenResponse = try await post(origin.appending(path: "auth/device/token"), [
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                "device_code": code.device_code,
                "client_id": Self.clientID,
            ])
            if let accessToken = token.access_token { return accessToken }
            switch token.error {
            case "authorization_pending", nil: continue
            case "slow_down": interval += 5
            case "access_denied": throw Failure.denied
            case "expired_token": throw Failure.expired
            case let other?: throw Failure.server(token.error_description ?? other)
            }
        }
        throw Failure.expired
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow) { return window }
        return ASPresentationAnchor(windowScene: scenes.first!)
    }

    private func post<T: Decodable>(_ url: URL, _ body: [String: String]) async throws -> T {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        if let decoded = try? JSON.decoder.decode(T.self, from: data) { return decoded }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        throw Failure.server("The server answered \(status) while signing in.")
    }
}
