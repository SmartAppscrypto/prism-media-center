import XCTest
import UIKit
@testable import PrismTV

final class TVPlaybackTests: XCTestCase {
    @MainActor func testVLCPlaysSampleAndCanRestart() async throws {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "PrismSample", withExtension: "mp4"))
        let engine = TVPlayback()
        let surface = UIView(frame: CGRect(x: 0, y: 0, width: 1920, height: 1080))
        engine.player.drawable = surface
        defer { engine.stop() }
        for attempt in 0..<2 {
            try engine.open(url)
            for _ in 0..<20 {
                if engine.elapsed > 0.5 { break }
                try await Task.sleep(for: .milliseconds(500))
            }
            if attempt == 1 {
                engine.retryWithSoftwareDecoder()
                for _ in 0..<20 {
                    if (engine.player.media?.statistics.decodedVideo ?? 0) > 0 && engine.elapsed > 0.5 { break }
                    try await Task.sleep(for: .milliseconds(500))
                }
                XCTAssertTrue(engine.compatibilityMode)
            }
            XCTAssertNil(engine.failure)
            XCTAssertGreaterThan(engine.player.media?.statistics.decodedVideo ?? 0, 0, "VLC must decode video frames, not merely advance its clock")
            XCTAssertGreaterThan(engine.elapsed, 0.5, "VLC must decode and advance the bundled video")
            let beforeSeek = engine.elapsed
            engine.seek(10)
            try await Task.sleep(for: .seconds(1))
            XCTAssertGreaterThan(engine.elapsed, beforeSeek + 5, "Seeking must change the stream position")
            engine.toggle()
            try await Task.sleep(for: .milliseconds(600))
            XCTAssertFalse(engine.player.isPlaying)
            engine.stop()
        }
    }
    @MainActor func testKeychainSurvivesNewSessionReadAndSignOutClearsIt() throws {
        let previous = SessionStore.load()
        defer { if let previous { try? SessionStore.save(previous) } else { SessionStore.clear() } }
        let session = SavedSession(server: "https://example.invalid", username: "fixture", token: "test-only", userID: "test-user")
        try SessionStore.save(session)
        XCTAssertEqual(SessionStore.load(), session)
        SessionStore.clear()
        XCTAssertNil(SessionStore.load())
    }
}
