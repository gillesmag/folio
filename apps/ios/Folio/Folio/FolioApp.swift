import SwiftUI

@main
struct FolioApp: App {
    @State private var auth = AuthSession()
    @State private var router = Router()
    @AppStorage(Appearance.storageKey) private var appearance: Appearance = .system

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .environment(router)
                .preferredColorScheme(appearance.colorScheme)
                .task {
                    #if DEBUG
                    // `--open <url>` drives the simulator without the "Open in Folio?" prompt.
                    let arguments = ProcessInfo.processInfo.arguments
                    let launchURL: URL? = if let index = arguments.firstIndex(of: "--open"), index + 1 < arguments.count {
                        URL(string: arguments[index + 1])
                    } else {
                        nil
                    }
                    #else
                    let launchURL: URL? = nil
                    #endif
                    await auth.restore()
                    if let launchURL { handle(launchURL) }
                }
                .onOpenURL(perform: handle)
        }
    }

    private func handle(_ url: URL) {
        #if DEBUG
        if url.scheme == "folio", url.host() == "signout" {
            auth.expire()
            return
        }
        if url.scheme == "folio", url.host() == "signin" {
            Task { await auth.signInWithGoogle() }
            return
        }
        #endif
        if auth.user == nil {
            router.pendingURL = url
        } else {
            router.open(url, serverOrigin: auth.origin)
        }
    }
}

struct RootView: View {
    @Environment(AuthSession.self) private var auth
    @Environment(Router.self) private var router

    var body: some View {
        switch auth.state {
        case .restoring:
            ProgressView()
        case .signedOut:
            SignInView()
        case .signedIn:
            DocumentsView()
                .onAppear {
                    if let url = router.pendingURL {
                        router.pendingURL = nil
                        router.open(url, serverOrigin: auth.origin)
                    }
                }
        }
    }
}
