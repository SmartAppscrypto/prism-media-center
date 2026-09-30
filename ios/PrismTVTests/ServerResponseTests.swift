import XCTest
import Foundation
@testable import PrismTV

private final class MetadataFixture: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let url = request.url else { return }
        let oversized = url.path.contains("oversized")
        let binary = url.path.contains("binary")
        let body = binary ? Data(repeating: 0x47, count: 128) : Data("{\"Items\":[]}".utf8)
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil,
            headerFields: ["Content-Length": oversized ? "16777217" : String(body.count)])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() { }
}

final class ServerResponseTests: XCTestCase {
    @MainActor func testMetadataRejectsOversizedAndBinaryBodies() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MetadataFixture.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let model = LibraryModel(network: session)
        model.server = "https://fixture.invalid"
        let valid: Items = try await model.request("valid")
        XCTAssertTrue(valid.Items.isEmpty)
        for (path, message) in [("oversized", "too large"), ("binary", "non-JSON")] {
            do {
                let _: Items = try await model.request(path)
                XCTFail("Must reject \(path) metadata before accumulating a media stream")
            } catch let error as PlaybackFailure {
                XCTAssertTrue(error.message.contains(message), error.message)
            }
        }
    }
}
