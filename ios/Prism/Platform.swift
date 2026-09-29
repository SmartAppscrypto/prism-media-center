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
