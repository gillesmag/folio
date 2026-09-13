import SwiftUI
import WebKit

/// The document itself. Transparent, edge to edge, scrolling under the glass bar.
struct DocumentWebView: UIViewRepresentable {
    let document: Document
    let model: ReaderModel
    let dark: Bool
    let canComment: Bool
    let serverOrigin: URL

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model, serverOrigin: serverOrigin)
    }

    func makeUIView(context: Context) -> ReaderWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(AssetSchemeHandler(), forURLScheme: ReaderPage.scheme)
        config.userContentController.add(context.coordinator, name: "folio")
        config.dataDetectorTypes = []
        config.allowsInlineMediaPlayback = true

        let webView = ReaderWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        // UIKit hands the representable the real safe area (status bar, glass bar, composer);
        // the scroll view insets itself by it so text starts below the chrome and scrolls under it.
        webView.scrollView.contentInsetAdjustmentBehavior = .always
        webView.scrollView.delegate = context.coordinator
        webView.allowsLinkPreview = true
        webView.allowsBackForwardNavigationGestures = false
        webView.navigationDelegate = context.coordinator
        webView.overrideUserInterfaceStyle = dark ? .dark : .light

        model.attach(webView, dark: dark)
        let html = ReaderPage.html(for: document, dark: dark, canComment: canComment)
        webView.loadHTMLString(html, baseURL: ReaderPage.baseURL)
        context.coordinator.loadedVersion = document.version
        return webView
    }

    func updateUIView(_ webView: ReaderWebView, context: Context) {
        // A newer version arrived after the first paint: reload with it.
        if context.coordinator.loadedVersion != document.version {
            context.coordinator.loadedVersion = document.version
            let html = ReaderPage.html(for: document, dark: dark, canComment: canComment)
            webView.loadHTMLString(html, baseURL: ReaderPage.baseURL)
        }
    }

    static func dismantleUIView(_ webView: ReaderWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "folio")
        webView.scrollView.delegate = nil
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, UIScrollViewDelegate {
        let model: ReaderModel
        let serverOrigin: URL
        var loadedVersion: Int?
        private var lastOffset: CGFloat = 0
        private var lastInsetTop: CGFloat = 0
        private var lastToggle = Date.distantPast
        private var userScrolled = false

        init(model: ReaderModel, serverOrigin: URL) {
            self.model = model
            self.serverOrigin = serverOrigin
        }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any] else { return }
            model.handle(message: body)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            (webView as? ReaderWebView)?.scrollToTop()
            model.pageDidLoad()
        }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let url = action.request.url else { return .cancel }
            // The page itself and its assets.
            if url.scheme == ReaderPage.scheme || url.scheme == "about" { return .allow }
            guard action.navigationType == .linkActivated || action.navigationType == .other else { return .cancel }
            if url.scheme == "http" || url.scheme == "https" {
                // A link to another document on this server stays in the app.
                let parts = url.pathComponents.filter { $0 != "/" }
                if url.host() == serverOrigin.host(), parts.count == 2, parts[0] == "d" {
                    model.linkedDocument = parts[1]
                } else {
                    model.externalURL = IdentifiedURL(url: url)
                }
            } else {
                await UIApplication.shared.open(url)
            }
            return .cancel
        }

        // Hide the bar while reading downwards; bring it back on any upward drag.
        // Only finger-driven scrolls count: inset changes and WebKit's own resets also
        // fire this callback, and reacting to those would toggle the bar in a loop.
        func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
            userScrolled = true
            lastOffset = scrollView.contentOffset.y + scrollView.adjustedContentInset.top
        }

        func scrollViewDidScroll(_ scrollView: UIScrollView) {
            let insetTop = scrollView.adjustedContentInset.top
            // WebKit lands a loaded page at offset 0, which is under the chrome. Until the
            // reader has scrolled, "the top" means just below the chrome.
            if !userScrolled, !scrollView.isDragging, !scrollView.isDecelerating,
               scrollView.contentOffset.y == 0, insetTop > 0 {
                scrollView.contentOffset = CGPoint(x: 0, y: -insetTop)
                return
            }
            let offset = scrollView.contentOffset.y + insetTop
            if insetTop != lastInsetTop {
                // The chrome changed height; not a scroll.
                lastInsetTop = insetTop
                lastOffset = offset
                return
            }
            let delta = offset - lastOffset
            lastOffset = offset
            guard scrollView.isTracking, Date().timeIntervalSince(lastToggle) > 0.4 else { return }
            let bottom = scrollView.contentSize.height - scrollView.bounds.height + scrollView.adjustedContentInset.bottom
            var hidden = model.barHidden
            if offset <= 0 || offset >= bottom {
                hidden = false
            } else if delta > 8, offset > 120, !model.isComposing {
                hidden = true
            } else if delta < -8 {
                hidden = false
            }
            guard hidden != model.barHidden else { return }
            lastToggle = Date()
            let model = model
            Task { @MainActor in model.barHidden = hidden }
        }
    }
}

/// WebKit lands a freshly loaded page at offset 0, which is under the chrome when the scroll
/// view carries a top inset. This keeps "the top" meaning "just below the chrome".
final class ReaderWebView: WKWebView {
    private var previousTop: CGFloat = 0

    func scrollToTop() {
        scrollView.setContentOffset(CGPoint(x: 0, y: -scrollView.adjustedContentInset.top), animated: false)
    }

    override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        let top = scrollView.adjustedContentInset.top
        defer { previousTop = top }
        // Still at the top when the chrome grew or shrank: stay pinned to it.
        if scrollView.contentOffset.y <= -previousTop + 1 {
            scrollView.contentOffset = CGPoint(x: 0, y: -top)
        }
    }
}
