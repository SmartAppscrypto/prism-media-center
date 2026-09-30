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

struct PlaybackResponse: Decodable {
    struct Source: Decodable {
        let Id: String
        let SupportsDirectPlay: Bool?
        let TranscodingUrl: String?
    }
    let MediaSources: [Source]?
    let PlaySessionId: String?
    let ErrorCode: String?
}

enum ApplePlayback {
    static func body(userID: String, forceTranscode: Bool = false) throws -> Data {
        try JSONSerialization.data(withJSONObject: [
            "UserId": userID, "StartTimeTicks": 0, "MaxStreamingBitrate": 20_000_000,
            "EnableDirectPlay": !forceTranscode, "EnableDirectStream": false,
            "EnableTranscoding": true, "AllowVideoStreamCopy": !forceTranscode,
            "AllowAudioStreamCopy": !forceTranscode,
            "DeviceProfile": [
                "Name": "PRISM Apple", "MaxStreamingBitrate": 20_000_000,
                "DirectPlayProfiles": [["Container": "mp4,m4v,mov", "Type": "Video", "VideoCodec": "h264,hevc", "AudioCodec": "aac,ac3,eac3,alac"]],
                "TranscodingProfiles": [["Container": "ts", "Type": "Video", "Protocol": "hls", "VideoCodec": "h264", "AudioCodec": "aac", "Context": "Streaming", "MaxAudioChannels": "2", "MinSegments": 2]],
                "CodecProfiles": [["Type": "Video", "Codec": "h264", "Conditions": [["Condition": "LessThanEqual", "Property": "VideoBitDepth", "Value": "8", "IsRequired": false]]]],
                "SubtitleProfiles": [["Format": "srt", "Method": "Encode"], ["Format": "ass", "Method": "Encode"], ["Format": "pgssub", "Method": "Encode"]]
            ]
        ])
    }

    // Never send a session token to a different host returned by a media server.
    static func streamURL(_ relative: String, server: String, token: String) throws -> URL {
        let root = try ServerAddress.endpoint(server: server, path: "")
        let base = root.appendingPathComponent("", isDirectory: true)
        guard let url = URL(string: relative, relativeTo: base)?.absoluteURL,
              url.scheme == base.scheme, url.host == base.host, url.port == base.port,
              url.user == nil, url.password == nil,
              var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { throw URLError(.badURL) }
        var query = parts.queryItems ?? []
        query.removeAll { $0.name.lowercased() == "api_key" }
        query.append(URLQueryItem(name: "api_key", value: token))
        parts.queryItems = query
        guard let result = parts.url else { throw URLError(.badURL) }
        return result
    }
}
