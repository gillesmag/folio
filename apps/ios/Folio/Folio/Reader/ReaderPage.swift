import UIKit

/// Builds the local page that wraps the server's HTML. Assets resolve through the
/// `folio-app` scheme, served from the bundle by `AssetSchemeHandler`.
enum ReaderPage {
    static let scheme = "folio-app"
    static let baseURL = URL(string: "\(scheme)://doc/")!

    /// Document tokens for `styles.css`, resolved from system colors for one appearance.
    static func tokens(dark: Bool) -> [String: String] {
        let traits = UITraitCollection(userInterfaceStyle: dark ? .dark : .light)
        func hex(_ color: UIColor) -> String {
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            color.resolvedColor(with: traits).getRed(&r, green: &g, blue: &b, alpha: &a)
            if a < 0.999 {
                return String(format: "rgba(%d, %d, %d, %.3f)", Int(r * 255), Int(g * 255), Int(b * 255), a)
            }
            return String(format: "#%02x%02x%02x", Int(r * 255), Int(g * 255), Int(b * 255))
        }
        let accent = UIColor(named: "AccentColor") ?? .tintColor
        return [
            "--doc-fg": hex(.label),
            "--doc-muted": hex(.secondaryLabel),
            "--doc-border": hex(.opaqueSeparator),
            "--doc-surface": hex(.secondarySystemBackground),
            "--doc-link": hex(.label),
            "--doc-accent": hex(accent),
            "--doc-selection": hex(accent.resolvedColor(with: traits).withAlphaComponent(dark ? 0.14 : 0.09)),
        ]
    }

    static func tokensJSON(dark: Bool) -> String {
        let data = try? JSONSerialization.data(withJSONObject: tokens(dark: dark))
        return data.flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    }

    /// Root font size in CSS px, from the body text style so the document follows Dynamic Type.
    static func rootFontSize() -> CGFloat {
        UIFont.preferredFont(forTextStyle: .body).pointSize / 17 * 16
    }

    static func html(for document: Document, dark: Bool, canComment: Bool) -> String {
        let tokenCSS = tokens(dark: dark).map { "\($0.key): \($0.value);" }.joined(separator: " ")
        let katex = document.meta.hasMath
            ? #"<link rel="stylesheet" href="folio-app://assets/katex/katex.min.css">"# : ""
        let mermaid = document.meta.hasMermaid
            ? #"<script src="folio-app://assets/mermaid.min.js"></script>"# : ""
        return """
        <!doctype html>
        <html class="\(dark ? "dark" : "")" lang="en">
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
        <meta name="color-scheme" content="light dark">
        <link rel="stylesheet" href="folio-app://assets/folio-doc.css">
        \(katex)
        <style>
        html { font-size: \(String(format: "%.2f", rootFontSize()))px; -webkit-text-size-adjust: 100%; }
        body { margin: 0; padding: 12px 20px calc(env(safe-area-inset-bottom) + 32px); background: transparent; -webkit-tap-highlight-color: transparent; }
        .folio-doc { \(tokenCSS) max-width: none; }
        .folio-doc [data-block-id] { scroll-margin-top: 6rem; }
        /* Touch has no hover: never show the desktop "+" affordance. */
        .folio-doc.can-comment [data-block-id]:hover::before { display: none; }
        .folio-doc [data-block-id][data-comments]::after { left: auto; right: -0.25rem; top: -0.6rem; }
        </style>
        </head>
        <body>
        <article class="folio-doc\(canComment ? " can-comment" : "")">\(document.html)</article>
        \(mermaid)
        <script src="folio-app://assets/reader.js"></script>
        </body>
        </html>
        """
    }
}
