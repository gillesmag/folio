import Foundation

/// Documents on disk, keyed by (id, version). Versions are immutable, so a hit is always right.
/// Lives in Caches: excluded from backup, and the system may evict it under pressure.
@MainActor
enum DocumentCache {
    private static var root: URL {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return caches.appending(path: "folio", directoryHint: .isDirectory)
    }

    private static func documentURL(_ id: String, version: Int) -> URL {
        root.appending(path: "documents/\(id)/\(version).json")
    }

    private static var listURL: URL { root.appending(path: "list.json") }

    static func read(_ id: String, version: Int) -> Document? {
        guard let data = try? Data(contentsOf: documentURL(id, version: version)) else { return nil }
        return try? JSON.decoder.decode(Document.self, from: data)
    }

    /// The newest cached version of a document, for when the list is not around to say which is current.
    static func readLatest(_ id: String) -> Document? {
        let dir = root.appending(path: "documents/\(id)")
        let files = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
        let versions = files.compactMap { Int($0.replacingOccurrences(of: ".json", with: "")) }
        guard let newest = versions.max() else { return nil }
        return read(id, version: newest)
    }

    static func write(_ document: Document) {
        let url = documentURL(document.id, version: document.version)
        let dir = url.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        if let data = try? JSON.encoder.encode(document) {
            try? data.write(to: url, options: .atomic)
        }
        // Older versions are dead weight once a newer one is on disk.
        let files = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
        for file in files where file != "\(document.version).json" {
            try? FileManager.default.removeItem(at: dir.appending(path: file))
        }
    }

    static func readList() -> [DocumentSummary]? {
        guard let data = try? Data(contentsOf: listURL) else { return nil }
        return try? JSON.decoder.decode([DocumentSummary].self, from: data)
    }

    static func writeList(_ list: [DocumentSummary]) {
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        if let data = try? JSON.encoder.encode(list) {
            try? data.write(to: listURL, options: .atomic)
        }
    }

    static func clear() {
        try? FileManager.default.removeItem(at: root)
    }
}
