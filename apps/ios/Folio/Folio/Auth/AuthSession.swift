import Foundation
import Observation

/// Who is signed in, against which server, and the client that carries the token.
@MainActor
@Observable
final class AuthSession {
    enum State: Equatable {
        case restoring
        case signedOut
        case signedIn(User)
    }

    private(set) var state: State = .restoring
    private(set) var origin: URL
    let client: FolioClient
    /// Last sign-in error, shown inline on the sign-in screen.
    var error: String?
    var isSigningIn = false

    private static let originKey = "serverOrigin"
    private static let userKey = "cachedUser"

    static var defaultOrigin: URL {
        let configured = Bundle.main.object(forInfoDictionaryKey: "FolioDefaultServer") as? String
        return URL(string: configured ?? "") ?? URL(string: "https://folio.example.com")!
    }

    init() {
        var origin = UserDefaults.standard.string(forKey: Self.originKey).flatMap(URL.init(string:)) ?? Self.defaultOrigin
        #if DEBUG
        if let override = ProcessInfo.processInfo.environment["FOLIO_SERVER"], let url = URL(string: override) {
            origin = url
        }
        #endif
        self.origin = origin
        client = FolioClient(origin: origin, token: Keychain.read(account: origin.absoluteString))
        client.onUnauthorized = { [weak self] in self?.expire() }
    }

    var user: User? {
        if case .signedIn(let user) = state { return user }
        return nil
    }

    /// Change the server. Only allowed while signed out.
    func setOrigin(_ url: URL) {
        guard state != .restoring, user == nil else { return }
        origin = url
        UserDefaults.standard.set(url.absoluteString, forKey: Self.originKey)
        client.origin = url
        client.token = Keychain.read(account: url.absoluteString)
    }

    /// Validate whatever token is stored. Offline, a cached user keeps the app usable.
    func restore() async {
        #if DEBUG
        if let token = ProcessInfo.processInfo.environment["FOLIO_TOKEN"], !token.isEmpty {
            store(token: token)
        }
        #endif
        guard client.token != nil else {
            state = .signedOut
            return
        }
        do {
            let me = try await client.me()
            cache(user: me)
            state = .signedIn(me)
        } catch APIError.unauthorized {
            expire()
        } catch {
            if let cached = cachedUser() {
                state = .signedIn(cached)
            } else {
                state = .signedOut
                self.error = error.localizedDescription
            }
        }
    }

    func signInWithGoogle() async {
        error = nil
        isSigningIn = true
        defer { isSigningIn = false }
        do {
            let token: String
            if GoogleAuth.clientID != nil {
                // Native: Google's sheet, then the ID token is exchanged for a Folio session.
                let tokens = try await GoogleAuth().signIn()
                token = try await client.signInWithGoogle(
                    idToken: tokens.idToken, accessToken: tokens.accessToken, nonce: tokens.nonce
                ).token
            } else {
                // No iOS client id: sign in with Google on the web app's device-approval page.
                token = try await DeviceFlowAuth().signIn(origin: origin)
            }
            store(token: token)
            let me = try await client.me()
            cache(user: me)
            state = .signedIn(me)
        } catch GoogleAuth.Failure.cancelled, DeviceFlowAuth.Failure.cancelled {
            // Nothing to report.
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Sign in with an existing session token, such as the one `folio login` stores.
    func signIn(token: String) async {
        error = nil
        isSigningIn = true
        defer { isSigningIn = false }
        store(token: token.trimmingCharacters(in: .whitespacesAndNewlines))
        do {
            let me = try await client.me()
            cache(user: me)
            state = .signedIn(me)
        } catch {
            client.token = nil
            Keychain.delete(account: origin.absoluteString)
            self.error = error.localizedDescription
        }
    }

    func signOut() async {
        try? await client.signOut()
        expire()
    }

    /// Forget the session locally. Also what a 401 triggers.
    func expire() {
        client.token = nil
        Keychain.delete(account: origin.absoluteString)
        UserDefaults.standard.removeObject(forKey: Self.userKey)
        DocumentCache.clear()
        state = .signedOut
    }

    private func store(token: String) {
        client.token = token
        Keychain.write(token, account: origin.absoluteString)
    }

    private func cache(user: User) {
        if let data = try? JSON.encoder.encode(user) {
            UserDefaults.standard.set(data, forKey: Self.userKey)
        }
    }

    private func cachedUser() -> User? {
        guard let data = UserDefaults.standard.data(forKey: Self.userKey) else { return nil }
        return try? JSON.decoder.decode(User.self, from: data)
    }
}
