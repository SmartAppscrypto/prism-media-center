import XCTest

final class CoreTests: XCTestCase {
    func testRuntimeCounter() {
        XCTAssertEqual(PlaybackTime.remaining(duration: 30, elapsed: 4.2), "0:26")
        XCTAssertEqual(PlaybackTime.remaining(duration: 7200, elapsed: 1), "1:59:59")
        XCTAssertEqual(PlaybackTime.remaining(duration: 10, elapsed: 11), "0:00")
        XCTAssertEqual(PlaybackTime.remaining(duration: .infinity, elapsed: 0), "--:--")
    }
    func testHorizontalDivisionSurvivesFullScreen() {
        let fold = CGRect(x: 0, y: 390, width: 800, height: 20)
        for mode in DisplayMode.allCases {
            let result = PlaybackLayout.resolve(size: CGSize(width: 800, height: 900), fold: fold, mode: mode)
            XCTAssertEqual(result.video.maxY, 390)
            XCTAssertEqual(result.secondary?.minY, 410)
            XCTAssertFalse(result.video.intersects(fold))
        }
    }
    func testOpenAndClosedUseSinglePane() {
        for size in [CGSize(width: 400, height: 800), CGSize(width: 900, height: 700)] {
            let result = PlaybackLayout.resolve(size: size, fold: nil, mode: .automatic)
            XCTAssertEqual(result.video.size, size)
            XCTAssertNil(result.secondary)
        }
    }
    func testVerticalDivisionAndNarrowWindow() {
        let result = PlaybackLayout.resolve(size: CGSize(width: 900, height: 700), fold: CGRect(x: 440, y: 0, width: 20, height: 700), mode: .automatic)
        XCTAssertEqual(result.video.width, 440)
        XCTAssertEqual(result.secondary?.minX, 460)
        XCTAssertNil(PlaybackLayout.resolve(size: CGSize(width: 390, height: 700), fold: nil, mode: .sideBySide).secondary)
    }
    func testRejectCredentialAndQueryAddresses() {
        for address in ["file:///tmp/media", "https://user:password@example.com", "https://example.com?api_key=secret", "https://example.com#fragment", "https://"] {
            XCTAssertThrowsError(try ServerAddress.endpoint(server: address, path: "Users"))
        }
    }
    func testSubpathAndEncodedToken() throws {
        let url = try ServerAddress.endpoint(server: "https://example.com/jellyfin/", path: "Users/abc/Items", query: [.init(name: "api_key", value: "a&b")])
        XCTAssertEqual(url.path, "/jellyfin/Users/abc/Items")
        XCTAssertEqual(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first?.value, "a&b")
    }
    func testRejectPathIdentifiers() throws {
        for id in ["", "../Admin", "abc/def", "a?b", "a%2Fb"] { XCTAssertThrowsError(try ServerAddress.id(id)) }
        XCTAssertEqual(try ServerAddress.id("ab12-cd34"), "ab12-cd34")
    }
    func testPlaybackNegotiatesCompatibleFormats() throws {
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: ApplePlayback.body(userID: "abc", forceTranscode: true)) as? [String: Any])
        XCTAssertEqual(body["EnableDirectPlay"] as? Bool, false)
        XCTAssertEqual(body["AllowVideoStreamCopy"] as? Bool, false)
        XCTAssertEqual(body["EnableTranscoding"] as? Bool, true)
        let profile = try XCTUnwrap(body["DeviceProfile"] as? [String: Any])
        let transcode = try XCTUnwrap((profile["TranscodingProfiles"] as? [[String: Any]])?.first)
        XCTAssertEqual(transcode["Protocol"] as? String, "hls")
        XCTAssertEqual(transcode["VideoCodec"] as? String, "h264")
        XCTAssertEqual(transcode["AudioCodec"] as? String, "aac")
    }
    func testPlaybackURLKeepsServerSubpathAndReplacesToken() throws {
        let url = try ApplePlayback.streamURL("Videos/abc/master.m3u8?api_key=old&MediaSourceId=xyz", server: "https://example.com/jellyfin", token: "a&b")
        XCTAssertEqual(url.path, "/jellyfin/Videos/abc/master.m3u8")
        let queries = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        XCTAssertEqual(queries.filter { $0.name == "api_key" }.map(\.value), ["a&b"])
    }
    func testPlaybackRejectsCrossOriginCredentialLeak() {
        for url in ["https://other.example/stream", "//other.example/stream", "http://example.com/stream", "https://example.com:8443/stream", "https://user:pass@example.com/stream", "file:///tmp/a"] {
            XCTAssertThrowsError(try ApplePlayback.streamURL(url, server: "https://example.com", token: "secret"))
        }
    }
}

final class LibrarySectionTests: XCTestCase {
    func testServerSectionsMatchDesktopQueries() {
        for (kind, types) in [("movies", "Movie"), ("tvshows", "Series"), ("homevideos", "Video"), ("music", "MusicAlbum")] {
            let section = LibrarySection(Id: "section1", Name: "My own name", CollectionType: kind)
            XCTAssertEqual(section.itemTypes, types)
            XCTAssertEqual(section.Name, "My own name")
        }
    }
    func testSavedSessionContainsNoPassword() throws {
        let saved = SavedSession(server: "https://example.com", username: "user", token: "revocable-token", userID: "abc")
        let data = try JSONEncoder().encode(saved)
        XCTAssertEqual(try JSONDecoder().decode(SavedSession.self, from: data), saved)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: String])
        XCTAssertNil(object["password"])
    }
}
