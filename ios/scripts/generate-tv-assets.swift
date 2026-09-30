// Reproduce PRISM's existing typographic mark as layered Apple TV assets.
import AppKit
import Foundation
let root = URL(fileURLWithPath: CommandLine.arguments[1])
let info: [String: Any] = ["author": "xcode", "version": 1]
func json(_ folder: URL, _ value: [String: Any]) throws {
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]).write(to: folder.appendingPathComponent("Contents.json"))
}
func png(_ url: URL, width: Int, height: Int, background: Bool, mark: Bool) throws {
    let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: (background ? CGImageAlphaInfo.noneSkipLast : CGImageAlphaInfo.premultipliedLast).rawValue)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
    (background ? NSColor(calibratedWhite: 0.02, alpha: 1) : NSColor.clear).setFill()
    NSRect(x: 0, y: 0, width: width, height: height).fill()
    if mark {
        let text = NSAttributedString(string: "PRISM", attributes: [.font: NSFont.systemFont(ofSize: CGFloat(width) * 0.13, weight: .medium), .foregroundColor: NSColor(calibratedWhite: 0.96, alpha: 1), .kern: CGFloat(width) * 0.025])
        let size = text.size()
        text.draw(at: NSPoint(x: (CGFloat(width)-size.width)/2, y: (CGFloat(height)-size.height)/2))
    }
    NSGraphicsContext.restoreGraphicsState()
    let bitmap = NSBitmapImageRep(cgImage: context.makeImage()!)
    try bitmap.representation(using: .png, properties: [:])!.write(to: url)
}
var assets: [[String: String]] = []
for (name, width, height, scales) in [("Small", 400, 240, [1,2]), ("Large", 1280, 768, [1])] {
    let stack = root.appendingPathComponent("\(name).imagestack")
    try json(stack, ["info":info, "layers":[["filename":"Foreground.imagestacklayer"],["filename":"Background.imagestacklayer"]]])
    for layer in ["Foreground", "Background"] {
        let folder = stack.appendingPathComponent("\(layer).imagestacklayer")
        try json(folder, ["info":info])
        let content = folder.appendingPathComponent("Content.imageset")
        try json(content, ["info":info,"images":scales.map { ["filename":"image\($0).png","idiom":"tv","scale":"\($0)x"] }])
        for scale in scales { try png(content.appendingPathComponent("image\(scale).png"), width: width*scale, height: height*scale, background: layer == "Background", mark: layer == "Foreground") }
    }
    assets.append(["filename":"\(name).imagestack","idiom":"tv","role":"primary-app-icon","size":"\(width)x\(height)"])
}
for (name,width,role) in [("TopShelf",1920,"top-shelf-image"),("TopShelfWide",2320,"top-shelf-image-wide")] {
    let folder = root.appendingPathComponent("\(name).imageset")
    try json(folder, ["info":info,"images":[1,2].map { ["filename":"image\($0).png","idiom":"tv","scale":"\($0)x"] }])
    for scale in [1,2] { try png(folder.appendingPathComponent("image\(scale).png"), width: width*scale, height: 720*scale, background: true, mark: true) }
    assets.append(["filename":"\(name).imageset","idiom":"tv","role":role,"size":"\(width)x720"])
}
try json(root, ["info":info,"assets":assets])
