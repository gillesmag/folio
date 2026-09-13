import Foundation
import WebKit

/// Serves `folio-app://assets/<path>` from the app bundle. Anything not in the bundle is a 404,
/// so the page can never reach a remote script through this origin.
final class AssetSchemeHandler: NSObject, WKURLSchemeHandler {
    private static let types: [String: String] = [
        "css": "text/css; charset=utf-8",
        "js": "text/javascript; charset=utf-8",
        "woff2": "font/woff2",
        "woff": "font/woff",
        "ttf": "font/ttf",
        "svg": "image/svg+xml",
        "png": "image/png",
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        let url = task.request.url!
        guard url.host() == "assets", let file = Self.locate(url.path()) , let data = try? Data(contentsOf: file) else {
            task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil)!)
            task.didFinish()
            return
        }
        let type = Self.types[file.pathExtension.lowercased()] ?? "application/octet-stream"
        let response = HTTPURLResponse(
            url: url, statusCode: 200, httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": type, "Content-Length": String(data.count), "Cache-Control": "max-age=31536000"])!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    /// `/katex/fonts/X.woff2` → `WebAssets/katex/fonts/X.woff2` (synced by the build script),
    /// else the bare filename at the bundle root (hand-written files like reader.js).
    private static func locate(_ path: String) -> URL? {
        let relative = path.hasPrefix("/") ? String(path.dropFirst()) : path
        guard !relative.contains("..") , let root = Bundle.main.resourceURL else { return nil }
        let synced = root.appending(path: "WebAssets/\(relative)")
        if FileManager.default.fileExists(atPath: synced.path) { return synced }
        let flat = root.appending(path: (relative as NSString).lastPathComponent)
        return FileManager.default.fileExists(atPath: flat.path) ? flat : nil
    }
}
