import SwiftUI
#if os(macOS)
import AppKit
#endif

extension View {
    @ViewBuilder func serverInput() -> some View {
        #if os(iOS) || os(tvOS)
        self.textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
        #else
        self.autocorrectionDisabled()
        #endif
    }
    @ViewBuilder func accountInput() -> some View {
        #if os(iOS) || os(tvOS)
        self.textInputAutocapitalization(.never).autocorrectionDisabled()
        #else
        self.autocorrectionDisabled()
        #endif
    }
}

func divisionFrame(_ proxy: GeometryProxy) -> CGRect? {
    #if os(iOS) && PRISM_DUO_SDK
    if #available(iOS 27.1, *) { return proxy.reservedRegions(kind: .division).first?.frame }
    #endif
    return nil
}

#if os(macOS)
// Resolve the containing window; do not accidentally fullscreen another PRISM window.
struct WindowAccessor: NSViewRepresentable {
    var onWindow: (NSWindow) -> Void
    func makeNSView(context: Context) -> WindowView { WindowView(onWindow: onWindow) }
    func updateNSView(_ nsView: WindowView, context: Context) { nsView.onWindow = onWindow }
    final class WindowView: NSView {
        var onWindow: (NSWindow) -> Void
        init(onWindow: @escaping (NSWindow) -> Void) { self.onWindow = onWindow; super.init(frame: .zero) }
        required init?(coder: NSCoder) { nil }
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            if let window { onWindow(window) }
        }
    }
}
#endif

#if os(macOS)
import AVKit

struct MacVideoPlayer: NSViewRepresentable {
    let player: AVPlayer
    func makeNSView(context: Context) -> AVPlayerView {
        let view = AVPlayerView()
        view.player = player
        view.controlsStyle = .floating
        view.showsFullScreenToggleButton = true
        // Authenticated stream URLs must never be offered to sharing services.
        view.showsSharingServiceButton = false
        return view
    }
    func updateNSView(_ view: AVPlayerView, context: Context) {
        if view.player !== player { view.player = player }
    }
    static func dismantleNSView(_ view: AVPlayerView, coordinator: ()) { view.player = nil }
}
#endif

struct PrismPoster: View {
    let item: Media
    let model: LibraryModel
    @State private var imageData: Data?
    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Rectangle().fill(LinearGradient(colors: [Color(red: 0.04, green: 0.25, blue: 0.32), .black], startPoint: .topLeading, endPoint: .bottomTrailing))
            if let imageData {
                GeometryReader { geometry in
                Group {
                #if os(macOS)
                if let image = NSImage(data: imageData) { Image(nsImage: image).resizable().scaledToFill() }
                #else
                if let image = UIImage(data: imageData) { Image(uiImage: image).resizable().scaledToFill() }
                #endif
                }.frame(width: geometry.size.width, height: geometry.size.height).clipped()
                }
            }
            if imageData == nil {
                VStack(alignment: .leading, spacing: 10) {
                    Image(systemName: "film").font(.largeTitle).foregroundStyle(.cyan)
                    Text(item.Name).font(.system(.title2, design: .serif)).lineLimit(4)
                    if let year = item.ProductionYear { Text(String(year)).font(.caption.monospaced()).foregroundStyle(.secondary) }
                }.padding(20)
            }
        }
        .aspectRatio(item.Type == "MusicAlbum" || item.Type == "Audio" ? 1 : 2 / 3, contentMode: .fit)
        .clipped().clipShape(RoundedRectangle(cornerRadius: 8))
        .task(id: item.id) { imageData = await model.artwork(item) }
        .accessibilityLabel(item.Name)
    }
}
