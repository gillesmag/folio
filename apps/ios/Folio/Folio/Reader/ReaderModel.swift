import Foundation
import Observation
import UIKit
import WebKit

/// State for one open document: the document, its comments, what is selected, and
/// what the chrome is doing. Also the native side of the bridge to `reader.js`.
@MainActor
@Observable
final class ReaderModel {
    let id: String
    private(set) var document: Document?
    private(set) var comments: [Comment] = []
    var loadError: String?
    var commentError: String?

    /// Block targeted by the composer; nil means the whole document.
    private(set) var anchor: String?
    var isComposing = false
    var draft = ""
    var sheet: ReaderSheet?
    var externalURL: IdentifiedURL?
    /// Another document on this server that a link pointed at; the view pushes it.
    var linkedDocument: String?

    private(set) var activeHeading: String?
    private(set) var titleVisible = true
    var barHidden = false

    private let client: FolioClient
    private let currentUserId: String?
    private weak var webView: WKWebView?
    private var dark = false

    init(id: String, client: FolioClient, currentUserId: String?) {
        self.id = id
        self.client = client
        self.currentUserId = currentUserId
    }

    var isOwner: Bool { document?.ownerId == currentUserId }

    var openComments: [Comment] { comments.filter { !$0.resolved } }

    var openCountsByBlock: [String: Int] {
        openComments.reduce(into: [:]) { counts, comment in
            if let block = comment.blockId { counts[block, default: 0] += 1 }
        }
    }

    // MARK: Loading

    func load(knownVersion: Int?) async {
        if document == nil {
            if let version = knownVersion, let cached = DocumentCache.read(id, version: version) {
                document = cached
            } else if let cached = DocumentCache.readLatest(id) {
                document = cached
            }
        }
        async let fetched: Void = fetchDocument()
        async let fetchedComments: Void = refreshComments()
        _ = await (fetched, fetchedComments)
    }

    private func fetchDocument() async {
        do {
            let fresh = try await client.document(id)
            if fresh.version != document?.version {
                document = fresh
                DocumentCache.write(fresh)
            }
            loadError = nil
        } catch {
            if document == nil { loadError = error.localizedDescription }
        }
    }

    func refreshComments() async {
        do {
            comments = try await client.comments(documentId: id).sorted { $0.createdAt > $1.createdAt }
            pushCommentBadges()
        } catch {
            // The document is still readable; comments just stay as they were.
        }
    }

    // MARK: Composer

    func beginComment(on blockId: String?) {
        anchor = blockId
        isComposing = true
        barHidden = false
        push("folio.select(\(Self.json(blockId)))")
    }

    func cancelComment() {
        isComposing = false
        anchor = nil
        push("folio.select(null)")
    }

    func postComment() async {
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        let target = anchor
        do {
            let created = try await client.createComment(documentId: id, blockId: target, body: body)
            comments.insert(created, at: 0)
            draft = ""
            commentError = nil
            cancelComment()
            pushCommentBadges()
        } catch {
            commentError = error.localizedDescription
        }
    }

    func setResolved(_ comment: Comment, _ resolved: Bool) async {
        do {
            let updated = try await client.setResolved(commentId: comment.id, resolved: resolved)
            if let index = comments.firstIndex(where: { $0.id == comment.id }) {
                comments[index] = updated
            }
            pushCommentBadges()
        } catch {
            commentError = error.localizedDescription
        }
    }

    func delete(_ comment: Comment) async {
        do {
            try await client.deleteComment(commentId: comment.id)
            comments.removeAll { $0.id == comment.id }
            pushCommentBadges()
        } catch {
            commentError = error.localizedDescription
        }
    }

    func canModerate(_ comment: Comment) -> Bool {
        comment.authorId == currentUserId || isOwner
    }

    func canDelete(_ comment: Comment) -> Bool {
        comment.authorId == currentUserId
    }

    // MARK: Bridge

    func attach(_ webView: WKWebView, dark: Bool) {
        self.webView = webView
        self.dark = dark
    }

    func pageDidLoad() {
        pushCommentBadges()
        if let anchor { push("folio.select(\(Self.json(anchor)))") }
    }

    func handle(message: [String: Any]) {
        switch message["type"] as? String {
        case "blockTap":
            let block = message["blockId"] as? String
            if let block, block != anchor {
                beginComment(on: block)
            } else if block != nil, isComposing {
                cancelComment()
            } else {
                if isComposing { cancelComment() }
                barHidden = false
            }
        case "heading":
            activeHeading = message["id"] as? String
        case "titleVisible":
            titleVisible = message["visible"] as? Bool ?? false
        default:
            break
        }
    }

    func scroll(to id: String) {
        push("folio.scrollTo(\(Self.json(id)))")
    }

    func applyTheme(dark: Bool) {
        guard dark != self.dark else { return }
        self.dark = dark
        webView?.overrideUserInterfaceStyle = dark ? .dark : .light
        push("folio.setTheme(\(dark), \(ReaderPage.tokensJSON(dark: dark)))")
    }

    func applyFontSize() {
        push("folio.setFontSize(\(ReaderPage.rootFontSize()))")
    }

    private func pushCommentBadges() {
        let data = try? JSONSerialization.data(withJSONObject: openCountsByBlock)
        push("folio.setComments(\(data.flatMap { String(data: $0, encoding: .utf8) } ?? "{}"))")
    }

    private func push(_ script: String) {
        webView?.evaluateJavaScript(script) { _, _ in }
    }

    private static func json(_ value: String?) -> String {
        guard let value, let data = try? JSONSerialization.data(withJSONObject: [value]),
              let text = String(data: data, encoding: .utf8)
        else { return "null" }
        return String(text.dropFirst().dropLast())
    }
}

struct IdentifiedURL: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}
