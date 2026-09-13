import Foundation
import Observation

enum Route: Hashable {
    case document(String)
}

enum ReaderSheet: String, Identifiable {
    case contents, comments
    /// Not a sheet: opens the composer. Only reachable from a debug deep link.
    case compose

    var id: String { rawValue }
}

/// Navigation state that outlives any one view: the stack, the settings sheet, and
/// deep links that arrived before the reader was on screen.
@MainActor
@Observable
final class Router {
    var path: [Route] = []
    var showSettings = false
    /// A sheet a deep link asked for; the reader consumes it once it has loaded.
    var pendingSheet: ReaderSheet?
    /// A deep link that arrived while signed out; replayed after sign-in.
    var pendingURL: URL?

    /// Handles `folio://d/<id>` and `https://<server>/d/<id>`.
    /// Debug builds also take `folio://settings` and `?sheet=contents|comments`, for driving the simulator.
    func open(_ url: URL, serverOrigin: URL) {
        let parts = url.pathComponents.filter { $0 != "/" }
        let isOurs = url.scheme == "folio" || url.host() == serverOrigin.host()
        guard isOurs else { return }

        #if DEBUG
        if url.scheme == "folio", url.host() == "settings" {
            showSettings = true
            return
        }
        #endif

        // folio://d/<id> has host "d"; https://server/d/<id> has path ["d", id].
        let id: String? = if url.scheme == "folio", url.host() == "d" {
            parts.first
        } else if parts.count >= 2, parts[0] == "d" {
            parts[1]
        } else {
            nil
        }
        guard let id else { return }

        showSettings = false
        if path.last != .document(id) {
            path.append(.document(id))
        }
        #if DEBUG
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        pendingSheet = query.first { $0.name == "sheet" }?.value.flatMap(ReaderSheet.init(rawValue:))
        #endif
    }
}
