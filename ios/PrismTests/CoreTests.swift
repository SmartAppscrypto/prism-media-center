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
}
