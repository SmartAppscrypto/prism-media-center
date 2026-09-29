import Foundation

enum ServerAddress {
    static func endpoint(server: String, path: String, query: [URLQueryItem] = []) throws -> URL {
        guard var parts = URLComponents(string: server.trimmingCharacters(in: .whitespacesAndNewlines)),
              ["https", "http"].contains(parts.scheme?.lowercased()),
              let host = parts.host, !host.isEmpty,
              parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil else {
            throw URLError(.badURL)
        }
        parts.path = "/" + ([parts.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")), path]
            .filter { !$0.isEmpty }.joined(separator: "/"))
        parts.queryItems = query.isEmpty ? nil : query
        guard let url = parts.url else { throw URLError(.badURL) }
        return url
    }

    // Jellyfin item/user IDs are opaque alphanumeric identifiers, never URL paths.
    static func id(_ value: String) throws -> String {
        guard !value.isEmpty, value.count <= 128,
              value.unicodeScalars.allSatisfy({ CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_").contains($0) }) else {
            throw URLError(.badURL)
        }
        return value
    }
}
