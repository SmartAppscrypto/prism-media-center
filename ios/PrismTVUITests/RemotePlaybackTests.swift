import XCTest
import UIKit

final class RemotePlaybackTests: XCTestCase {
    @MainActor private func select(_ target: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<20 {
            if target.hasFocus || (app.cells[target.label].exists && app.cells[target.label].hasFocus) { XCUIRemote.shared.press(.select); return }
            let focused = app.descendants(matching: .any).allElementsBoundByIndex.first { $0.hasFocus }
            guard let focused else { XCUIRemote.shared.press(.down); continue }
            let dx = target.frame.midX - focused.frame.midX
            let dy = target.frame.midY - focused.frame.midY
            if abs(dy) < 30 && focused.frame.contains(CGPoint(x: target.frame.midX, y: target.frame.midY)) { XCUIRemote.shared.press(.select); return }
            if abs(dy) > 30 { XCUIRemote.shared.press(dy > 0 ? .down : .up) }
            else { XCUIRemote.shared.press(dx > 0 ? .right : .left) }
        }
        XCTFail("Could not focus \(target.label)")
    }
    @MainActor private func brightness(_ screenshot: XCUIScreenshot) throws -> Double {
        let image = try XCTUnwrap(screenshot.image.cgImage)
        // Sample the center/top region, clear of the transport overlay.
        let crop = try XCTUnwrap(image.cropping(to: CGRect(x: image.width / 4, y: image.height / 8,
                                                         width: image.width / 2, height: image.height / 4)))
        var pixels = [UInt8](repeating: 0, count: 64 * 32 * 4)
        let total: Double = try pixels.withUnsafeMutableBytes { bytes in
            let context = try XCTUnwrap(CGContext(data: bytes.baseAddress, width: 64, height: 32,
                bitsPerComponent: 8, bytesPerRow: 64 * 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
            context.draw(crop, in: CGRect(x: 0, y: 0, width: 64, height: 32))
            let values = bytes.bindMemory(to: UInt8.self)
            return stride(from: 0, to: values.count, by: 4).reduce(0.0) { sum, index in
                sum + Double(values[index]) + Double(values[index + 1]) + Double(values[index + 2])
            }
        }
        return total / (64 * 32 * 3 * 255)
    }
    @MainActor func testRemoteTransportAndReturnToGallery() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        let sample = app.buttons["Try sample library"]
        XCTAssertTrue(sample.waitForExistence(timeout: 10))
        select(sample, in: app)
        let title = app.buttons["PRISM Playback Sample"]
        XCTAssertTrue(title.waitForExistence(timeout: 10))
        let galleryShot = XCTAttachment(screenshot: app.screenshot())
        galleryShot.name = "TV gallery"; galleryShot.lifetime = .keepAlways; add(galleryShot)
        select(title, in: app)
        let detailsShot = XCTAttachment(screenshot: app.screenshot())
        detailsShot.name = "TV details"; detailsShot.lifetime = .keepAlways; add(detailsShot)
        select(app.buttons["play-title"], in: app)
        let surface = app.buttons["Show playback controls"]
        XCTAssertTrue(surface.waitForExistence(timeout: 10))
        XCUIRemote.shared.press(.select)
        let pause = app.buttons["Pause"]
        XCTAssertTrue(pause.waitForExistence(timeout: 10))
        let controlsShot = XCTAttachment(screenshot: app.screenshot())
        controlsShot.name = "TV controls"; controlsShot.lifetime = .keepAlways; add(controlsShot)
        XCTAssertTrue(pause.hasFocus, "Revealing controls must focus the transport")
        XCUIRemote.shared.press(.select)
        let play = app.buttons["Play"]
        XCTAssertTrue(play.waitForExistence(timeout: 5))
        // Paused pixels above the transport must remain unchanged when the
        // invisible focus target replaces the controls (white-overlay regression).
        let visible = try brightness(app.screenshot())
        XCUIRemote.shared.press(.menu)
        XCTAssertTrue(surface.waitForExistence(timeout: 5))
        let hiddenShot = app.screenshot()
        let hidden = try brightness(hiddenShot)
        let hiddenAttachment = XCTAttachment(screenshot: hiddenShot)
        hiddenAttachment.name = "Unobscured paused video"; hiddenAttachment.lifetime = .keepAlways; add(hiddenAttachment)
        XCTAssertEqual(hidden, visible, accuracy: 0.04, "Hidden transport focus must not wash out the picture")
        XCUIRemote.shared.press(.playPause)
        XCTAssertTrue(pause.waitForExistence(timeout: 5))
        XCUIRemote.shared.press(.right)
        XCTAssertTrue(app.buttons["Forward 10 seconds"].hasFocus)
        XCUIRemote.shared.press(.select)
        XCUIRemote.shared.press(.menu)
        XCTAssertTrue(surface.waitForExistence(timeout: 5))
        XCUIRemote.shared.press(.menu)
        XCTAssertTrue(title.waitForExistence(timeout: 5))
    }
}
