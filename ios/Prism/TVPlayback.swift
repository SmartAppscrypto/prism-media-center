#if os(tvOS)
import SwiftUI
import AVFAudio
@preconcurrency import TVVLCKit

@MainActor @Observable
final class TVPlayback {
    let player = VLCMediaPlayer(options: ["--no-video-title-show", "--quiet"])
    var elapsed = 0.0
    var duration = 0.0
    var isPlaying = false
    var loading = true
    var failure: String?
    private var monitor: Task<Void, Never>?
    func open(_ url: URL) throws {
        stop()
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try AVAudioSession.sharedInstance().setActive(true)
        failure = nil; loading = true
        let media = VLCMedia(url: url)
        media.addOption(":network-caching=1500")
        player.media = media
        player.play()
        monitor = Task { [weak self] in
            var startup = 0
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(500))
                guard !Task.isCancelled, let self else { return }
                self.elapsed = Double(self.player.time.intValue) / 1000
                self.duration = Double(self.player.media?.length.intValue ?? 0) / 1000
                self.isPlaying = self.player.isPlaying
                if self.player.state == .playing || self.elapsed > 0 { self.loading = false }
                if self.loading { startup += 1 }
                if self.player.state == .error || startup >= 120 {
                    self.failure = "VLC could not open this file. Check that the media is available on your server, then retry. Your sign-in has been kept."
                    self.loading = false; self.player.stop(); return
                }
                if self.player.state == .ended { self.isPlaying = false; return }
            }
        }
    }
    func toggle() { if player.isPlaying { player.pause() } else { player.play() }; isPlaying = player.isPlaying }
    func seek(_ delta: Int32) { if delta < 0 { player.jumpBackward(-delta) } else { player.jumpForward(delta) } }
    func stop() { monitor?.cancel(); monitor = nil; player.stop(); elapsed = 0; duration = 0; isPlaying = false; loading = false }
}

struct TVVideoSurface: UIViewRepresentable {
    let engine: TVPlayback
    func makeUIView(context: Context) -> UIView {
        let view = UIView(); view.backgroundColor = .black; engine.player.drawable = view; return view
    }
    func updateUIView(_ view: UIView, context: Context) {
        if engine.player.drawable as? UIView !== view { engine.player.drawable = view }
    }
    static func dismantleUIView(_ view: UIView, coordinator: ()) { }
}

struct TVPlaybackScreen: View {
    let model: LibraryModel
    @State private var controls = false
    @State private var interaction = 0
    var body: some View {
        ZStack {
            Color.black
            TVVideoSurface(engine: model.tvPlayback)
            if model.playing?.Type == "Audio", let item = model.playing {
                VStack(spacing: 24) {
                    PrismPoster(item: item, model: model).frame(width: 320)
                    Text(item.Name).font(.title)
                }
            }
            if model.preparingPlayback || model.tvPlayback.loading { ProgressView("Opening media…").padding(24).background(.black.opacity(0.8)) }
            if controls {
                VStack {
                    Spacer()
                    VStack(alignment: .leading, spacing: 20) {
                        Text(model.playing?.Name ?? "PRISM").font(.title2)
                        if model.tvPlayback.duration > 0 {
                            ProgressView(value: min(model.tvPlayback.elapsed, model.tvPlayback.duration), total: model.tvPlayback.duration)
                            Text(PlaybackTime.remaining(duration: model.tvPlayback.duration, elapsed: model.tvPlayback.elapsed) + " remaining").font(.caption.monospaced())
                        }
                        HStack(spacing: 24) {
                            Button("Back to library") { model.stop() }
                            Button { model.tvPlayback.seek(-10); reveal() } label: { Image(systemName: "gobackward.10") }
                            Button { model.tvPlayback.toggle(); reveal() } label: { Image(systemName: model.tvPlayback.isPlaying ? "pause.fill" : "play.fill") }
                            Button { model.tvPlayback.seek(10); reveal() } label: { Image(systemName: "goforward.10") }
                        }
                    }.padding(40).background(.black.opacity(0.85))
                }.padding(40)
            }
        }
        .ignoresSafeArea()
        .focusable(!controls)
        .onTapGesture { reveal() }
        .onMoveCommand { _ in reveal() }
        .task(id: interaction) {
            try? await Task.sleep(for: .seconds(5))
            if !Task.isCancelled, model.tvPlayback.isPlaying { controls = false }
        }
        .onChange(of: model.tvPlayback.failure) { _, failure in
            if let failure { model.stop(); model.error = failure }
        }
    }
    private func reveal() { controls = true; interaction += 1 }
}
#endif
