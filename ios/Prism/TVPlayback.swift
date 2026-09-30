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
    var seekable = false
    var compatibilityMode = false
    var status: String?
    var failure: String?
    var diagnostics = ""
    private var monitor: Task<Void, Never>?
    private var source: URL?
    private var expectsVideo = true
    private var streamDescription = ""

    func open(_ url: URL, expectsVideo: Bool = true, streamDescription: String = "") throws {
        stop()
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try AVAudioSession.sharedInstance().setActive(true)
        source = url; self.expectsVideo = expectsVideo; self.streamDescription = streamDescription
        compatibilityMode = false
        start(at: 0)
    }

    private func start(at seconds: Double) {
        guard let source else { return }
        monitor?.cancel(); player.stop()
        failure = nil; loading = true; elapsed = seconds; seekable = false
        let media = VLCMedia(url: source)
        media.addOption(":network-caching=1500")
        // VLC's native VideoToolbox module is separate from avcodec's hardware backend.
        if compatibilityMode { media.addOption(":no-videotoolbox"); media.addOption(":avcodec-hw=none") }
        if seconds > 0 { media.addOption(":start-time=\(seconds)") }
        player.media = media
        player.play()
        monitor = Task { [weak self] in
            var startup = 0
            var missingPicture = 0
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(500))
                guard !Task.isCancelled, let self else { return }
                elapsed = Double(player.time.intValue) / 1000
                duration = Double(player.media?.length.intValue ?? 0) / 1000
                isPlaying = player.isPlaying; seekable = player.isSeekable
                let stats = player.media?.statistics
                diagnostics = "\(streamDescription)\n\(compatibilityMode ? "Software" : "Automatic") decoder · decoded \(stats?.decodedVideo ?? 0) · displayed \(stats?.displayedPictures ?? 0) · lost \(stats?.lostPictures ?? 0)"
                if player.state == .playing || elapsed > 0 { loading = false }
                if compatibilityMode && (stats?.displayedPictures ?? 0) > 0 { status = "Playing with the software decoder" }
                if loading { startup += 1 }
                // Detect missing output, not black scene content. Never retry music or a paused player.
                if expectsVideo && isPlaying && elapsed > 1 && (stats?.displayedPictures ?? 0) == 0 {
                    missingPicture += 1
                } else { missingPicture = 0 }
                if missingPicture >= 20 && !compatibilityMode {
                    retryWithSoftwareDecoder(); return
                }
                if missingPicture >= 30 && compatibilityMode {
                    status = "No video frames are reaching the display. Open Playback info to check the format."
                }
                if player.state == .error || startup >= 120 {
                    failure = "VLC could not open this file. Check that the media is available on your server, then retry. Your sign-in has been kept."
                    loading = false; player.stop(); return
                }
                if player.state == .ended { isPlaying = false; return }
            }
        }
    }
    func retryWithSoftwareDecoder() {
        guard source != nil, expectsVideo, !compatibilityMode else { return }
        let position = max(0, elapsed - 2)
        compatibilityMode = true; status = "Retrying video with the software decoder…"
        start(at: position)
    }
    func toggle() { if player.isPlaying { player.pause() } else { player.play() }; isPlaying = player.isPlaying }
    func seek(_ delta: Int32) {
        guard player.isSeekable else { return }
        let target = max(0, min(duration > 0 ? duration - 0.1 : .greatestFiniteMagnitude, elapsed + Double(delta)))
        player.time = VLCTime(int: Int32(clamping: Int64(target * 1000)))
        elapsed = target
    }
    func stop() {
        monitor?.cancel(); monitor = nil; player.stop(); source = nil
        elapsed = 0; duration = 0; isPlaying = false; loading = false; seekable = false; status = nil
    }
}

struct TVVideoSurface: UIViewRepresentable {
    let engine: TVPlayback
    func makeUIView(context: Context) -> UIView {
        let view = UIView(); view.backgroundColor = .black; engine.player.drawable = view; return view
    }
    func updateUIView(_ view: UIView, context: Context) {
        if engine.player.drawable as? UIView !== view { engine.player.drawable = view }
    }
}

struct TVPlaybackScreen: View {
    let model: LibraryModel
    private enum Control: Hashable { case surface, back, rewind, play, forward, retry, info }
    @FocusState private var focused: Control?
    @State private var controls = false
    @State private var interaction = 0
    @State private var showInfo = false
    var body: some View {
        ZStack {
            Color.black
            TVVideoSurface(engine: model.tvPlayback).allowsHitTesting(false)
            if model.playing?.Type == "Audio", let item = model.playing {
                VStack(spacing: 24) {
                    PrismPoster(item: item, model: model).frame(width: 320)
                    Text(item.Name).font(.title)
                }
            }
            if !controls {
                // A real focus target remains available when the transport is hidden.
                Button(action: reveal) { Color.clear.contentShape(Rectangle()) }
                    .buttonStyle(.plain).focused($focused, equals: .surface)
                    .accessibilityLabel("Show playback controls")
                    .onMoveCommand { _ in reveal() }
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
                            Button("Library") { model.stop() }.focused($focused, equals: .back)
                            Button { model.tvPlayback.seek(-10); touch() } label: { Image(systemName: "gobackward.10") }
                                .accessibilityLabel("Rewind 10 seconds").focused($focused, equals: .rewind).disabled(!model.tvPlayback.seekable)
                            Button { model.tvPlayback.toggle(); touch() } label: { Image(systemName: model.tvPlayback.isPlaying ? "pause.fill" : "play.fill") }
                                .accessibilityLabel(model.tvPlayback.isPlaying ? "Pause" : "Play").focused($focused, equals: .play)
                            Button { model.tvPlayback.seek(10); touch() } label: { Image(systemName: "goforward.10") }
                                .accessibilityLabel("Forward 10 seconds").focused($focused, equals: .forward).disabled(!model.tvPlayback.seekable)
                            if model.playing?.Type != "Audio" {
                                Button("Retry picture") { model.tvPlayback.retryWithSoftwareDecoder(); touch() }
                                    .focused($focused, equals: .retry).disabled(model.tvPlayback.compatibilityMode)
                            }
                            Button("Playback info") { showInfo.toggle(); touch() }.focused($focused, equals: .info)
                        }
                        if showInfo { Text(model.tvPlayback.diagnostics).font(.caption.monospaced()) }
                        if let status = model.tvPlayback.status { Text(status).font(.caption) }
                    }.padding(40).background(.black.opacity(0.85))
                }.padding(40)
            }
        }
        .ignoresSafeArea()
        .onAppear { focused = .surface }
        .onPlayPauseCommand { model.tvPlayback.toggle(); reveal() }
        .onExitCommand { if controls { hide() } else { model.stop() } }
        .onChange(of: focused) { _, _ in touch() }
        .task(id: interaction) {
            try? await Task.sleep(for: .seconds(7))
            if !Task.isCancelled, model.tvPlayback.isPlaying, !showInfo { hide() }
        }
        .onChange(of: model.tvPlayback.failure) { _, failure in
            if let failure { model.stop(); model.error = failure }
        }
    }
    private func touch() { interaction += 1 }
    private func reveal() { controls = true; focused = .play; touch() }
    private func hide() { controls = false; showInfo = false; focused = .surface }
}
#endif
