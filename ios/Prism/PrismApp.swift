import SwiftUI
import AVKit
#if os(macOS)
import AppKit
#endif

@main
struct PrismApp: App {
    var body: some Scene {
        WindowGroup {
            PrismWindow()
                .preferredColorScheme(.dark)
        }
    }
}

final class NoRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

struct DTOKey: CodingKey {
    let stringValue: String
    var intValue: Int? { nil }
    init(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { return nil }
}

struct Media: Decodable, Identifiable, Hashable {
    let Id: String
    let Name: String
    let `Type`: String?
    let Overview: String?
    let ProductionYear: Int?
    let RunTimeTicks: Double?
    let ProviderIds: [String: String]?
    var id: String { Id }
}
struct Items: Decodable { let Items: [Media] }
struct Login: Decodable {
    struct UserInfo: Decodable { let Id: String }
    let AccessToken: String
    let User: UserInfo
}
struct PlaybackFailure: Error {
    let message: String
}

struct Finances: Decodable { let budget: Double?; let revenue: Double? }

@MainActor @Observable
final class LibraryModel {
    // Passwords remain in memory; revocable session tokens are stored in Keychain.
    var server = ""
    var username = ""
    var password = ""
    var isDemo = false
    var token = ""
    var userID = ""
    var libraries: [LibrarySection] = []
    var libraryID = ""
    var items: [Media] = []
    #if os(tvOS)
    var tvPlayback = TVPlayback()
    #endif
    var episodes: [Media] = []
    var selected: Media?
    var playing: Media?
    var error = ""
    var busy = false
    var tmdbToken = ""
    var finances: Finances?
    var player = AVPlayer()
    var seconds = 0.0
    var duration = 0.0
    private var playbackTask: Task<Void, Never>?
    private var playbackMonitor: Task<Void, Never>?
    var preparingPlayback = false
    private var playbackRevision = 0
    private var deviceID = UUID().uuidString
    private let network = URLSession(configuration: .ephemeral, delegate: NoRedirects(), delegateQueue: nil)
    private var selectionTask: Task<Void, Never>?
    private var sessionRevision = 0
    private var reloadRevision = 0

    private var restored = false
    func restoreSession() async {
        guard !restored else { return }
        restored = true
        guard let saved = SessionStore.load() else { return }
        server = saved.server; username = saved.username; token = saved.token; userID = saved.userID
        await loadLibraries()
    }
    func loadLibraries() async {
        let revision = sessionRevision
        do {
            let response: LibrarySections = try await request("Users/\(try ServerAddress.id(userID))/Views")
            guard revision == sessionRevision else { return }
            libraries = response.Items
            if !libraries.contains(where: { $0.id == libraryID }) { libraryID = libraries.first?.id ?? "" }
            await reload()
        } catch { if revision == sessionRevision { self.error = "Could not load your library sections. Check the server connection and refresh. Your saved sign-in has been kept." } }
    }
    func changeLibrary(_ library: LibrarySection) async {
        libraryID = library.id; selected = nil; episodes = []; items = []
        selectionTask?.cancel()
        await reload()
    }
    func endpoint(_ path: String, query: [URLQueryItem] = []) throws -> URL {
        try ServerAddress.endpoint(server: server, path: path, query: query)
    }

    func request<T: Decodable>(_ path: String, query: [URLQueryItem] = [], body: Data? = nil) async throws -> T {
        var request = URLRequest(url: try endpoint(path, query: query))
        request.timeoutInterval = 20
        request.setValue("MediaBrowser Client=\"PRISM\", Device=\"Apple\", DeviceId=\"\(deviceID)\", Version=\"1.0.0\"", forHTTPHeaderField: "Authorization")
        if !token.isEmpty { request.setValue(token, forHTTPHeaderField: "X-Emby-Token") }
        if let body { request.httpMethod = "POST"; request.httpBody = body; request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await network.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw PlaybackFailure(message: "Server returned no HTTP response.") }
        guard (200..<300).contains(response.statusCode) else { throw PlaybackFailure(message: "Server request failed (HTTP \(response.statusCode)).") }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .custom { keys in
            let key = keys.last!.stringValue
            return DTOKey(stringValue: key.prefix(1).uppercased() + key.dropFirst())
        }
        do { return try decoder.decode(T.self, from: data) }
        catch let DecodingError.keyNotFound(key, _) { throw PlaybackFailure(message: "Server response is missing field \(key.stringValue).") }
        catch is DecodingError { throw PlaybackFailure(message: "Server response has an unexpected format.") }
    }
    func signIn() async {
        guard !busy else { return }
        let revision = sessionRevision
        busy = true; error = ""
        defer { if revision == sessionRevision { busy = false; password = "" } }
        do {
            let login: Login = try await request("Users/AuthenticateByName", body: JSONEncoder().encode(["Username": username, "Pw": password]))
            guard revision == sessionRevision else { return }
            token = login.AccessToken; userID = login.User.Id
            do { try SessionStore.save(SavedSession(server: server, username: username, token: token, userID: userID)) }
            catch { self.error = "Connected, but Keychain could not save your sign-in on this device." }
            await loadLibraries()
        } catch { if revision != sessionRevision { return }; self.error = "Could not sign in. Check your server address, network access and account. Use HTTPS for a remote server." }
    }
    func reload() async {
        if isDemo { items.shuffle(); return }
        guard !token.isEmpty else { return }
        reloadRevision += 1
        let revision = reloadRevision
        let session = sessionRevision
        busy = true; defer { if revision == reloadRevision && session == sessionRevision { busy = false } }
        do {
            guard let library = libraries.first(where: { $0.id == libraryID }) else { items = []; return }
            let result: Items = try await request("Users/\(try ServerAddress.id(userID))/Items", query: [
                .init(name: "ParentId", value: try ServerAddress.id(library.id)),
                .init(name: "Recursive", value: "true"), .init(name: "IncludeItemTypes", value: library.itemTypes),
                .init(name: "Fields", value: "Overview,ProviderIds,RunTimeTicks"), .init(name: "SortBy", value: "SortName")
            ])
            guard revision == reloadRevision && session == sessionRevision else { return }
            items = result.Items
        } catch { if revision == reloadRevision && session == sessionRevision { self.error = "Your library could not be loaded. Check the server and retry." } }
    }
    func select(_ item: Media) {
        selectionTask?.cancel(); selected = item; episodes = []; finances = nil
        if isDemo { return }
        selectionTask = Task {
            do {
                if item.Type == "Series" {
                    let result: Items = try await request("Shows/\(try ServerAddress.id(item.id))/Episodes", query: [.init(name: "userId", value: userID), .init(name: "Fields", value: "Overview,ProviderIds")])
                    if !Task.isCancelled { episodes = result.Items }
                }
                if item.Type == "MusicAlbum" {
                    let result: Items = try await request("Users/\(try ServerAddress.id(userID))/Items", query: [.init(name: "ParentId", value: try ServerAddress.id(item.id)), .init(name: "IncludeItemTypes", value: "Audio"), .init(name: "SortBy", value: "ParentIndexNumber,IndexNumber,SortName")])
                    if !Task.isCancelled { episodes = result.Items }
                }
                if item.Type == "Movie", !tmdbToken.isEmpty, let id = item.ProviderIds?["Tmdb"] ?? item.ProviderIds?["tmdb"], Int(id) != nil {
                    var request = URLRequest(url: URL(string: "https://api.themoviedb.org/3/movie/\(id)")!)
                    request.timeoutInterval = 20
                    request.setValue("Bearer \(tmdbToken)", forHTTPHeaderField: "Authorization")
                    let (data, response) = try await network.data(for: request)
                    if (response as? HTTPURLResponse)?.statusCode == 200, !Task.isCancelled { finances = try JSONDecoder().decode(Finances.self, from: data) }
                }
            } catch { if !Task.isCancelled { self.error = "Details could not be loaded. Please retry." } }
        }
    }
    func play(_ item: Media) {
        stop()
        let revision = playbackRevision
        playing = item; preparingPlayback = true; error = ""
        playbackTask = Task {
            do {
                #if os(tvOS)
                let url: URL
                var streamDescription = ""
                if isDemo {
                    guard let sample = Bundle.main.url(forResource: "PrismSample", withExtension: "mp4") else { throw URLError(.fileDoesNotExist) }
                    url = sample
                } else if item.Type == "Audio" {
                    url = try endpoint("Audio/\(try ServerAddress.id(item.id))/stream", query: [.init(name: "static", value: "true"), .init(name: "api_key", value: token)])
                } else {
                    // Same direct-source strategy as desktop/src/jellyfin.ts + libVLC.
                    let info: PlaybackResponse = try await request("Items/\(try ServerAddress.id(item.id))/PlaybackInfo", query: [.init(name: "UserId", value: userID)])
                    guard let source = info.MediaSources?.first else { throw PlaybackFailure(message: "No media source is available for this title.") }
                    streamDescription = source.videoDescription
                    url = try endpoint("Videos/\(try ServerAddress.id(item.id))/stream", query: [.init(name: "static", value: "true"), .init(name: "MediaSourceId", value: source.Id), .init(name: "api_key", value: token)])
                }
                guard !Task.isCancelled, revision == playbackRevision else { return }
                try tvPlayback.open(url, expectsVideo: item.Type != "Audio", streamDescription: streamDescription)
                preparingPlayback = false
                #else
                let url = try await playbackURL(item, forceTranscode: false)
                guard !Task.isCancelled, revision == playbackRevision else { return }
                try startPlayer(url, item: item, revision: revision, canRetry: !isDemo)
                #endif
            } catch {
                guard !Task.isCancelled, revision == playbackRevision else { return }
                playbackFailed("Preparing stream: " + diagnostic(error))
            }
        }
    }
    private func playbackURL(_ item: Media, forceTranscode: Bool) async throws -> URL {
        if isDemo {
            guard let sample = Bundle.main.url(forResource: "PrismSample", withExtension: "mp4") else { throw URLError(.fileDoesNotExist) }
            return sample
        }
        let response: PlaybackResponse = try await request("Items/\(try ServerAddress.id(item.id))/PlaybackInfo",
            query: [.init(name: "UserId", value: userID), .init(name: "DeviceId", value: deviceID)],
            body: ApplePlayback.body(userID: userID, forceTranscode: forceTranscode))
        if let code = response.ErrorCode, code != "None" {
            let known = ["NotAllowed", "NoCompatibleStream", "RateLimitExceeded"]
            throw PlaybackFailure(message: "Server playback response: " + (known.contains(code) ? code : "unavailable stream"))
        }
        guard let source = response.MediaSources?.first else { throw PlaybackFailure(message: "Server returned no media sources.") }
        print("PRISM playback: sources=\(response.MediaSources?.count ?? 0), direct=\(source.SupportsDirectPlay == true), HLS=\(source.TranscodingUrl != nil), fallback=\(forceTranscode)")
        if source.SupportsDirectPlay == true && !forceTranscode {
            return try endpoint("Videos/\(try ServerAddress.id(item.id))/stream", query: [
                .init(name: "static", value: "true"), .init(name: "MediaSourceId", value: source.Id),
                .init(name: "DeviceId", value: deviceID), .init(name: "api_key", value: token)])
        }
        guard let stream = source.TranscodingUrl else { throw PlaybackFailure(message: "Server returned no compatible HLS stream. Check this user's playback and transcoding permissions.") }
        let streamURL = try ApplePlayback.streamURL(stream, server: server, token: token)
        try await checkPlaylist(streamURL)
        return streamURL
    }
    private func checkPlaylist(_ url: URL, depth: Int = 0) async throws {
        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        request.setValue(token, forHTTPHeaderField: "X-Emby-Token")
        let (data, response) = try await network.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw PlaybackFailure(message: "HLS playlist returned no HTTP response.") }
        print("PRISM playback: HLS playlist level=\(depth), HTTP=\(http.statusCode), bytes=\(data.count)")
        guard http.statusCode == 200 else { throw PlaybackFailure(message: "Jellyfin HLS playlist returned HTTP \(http.statusCode). Check the server's FFmpeg log for this playback attempt.") }
        guard let text = String(data: data, encoding: .utf8), text.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("#EXTM3U") else { throw PlaybackFailure(message: "Jellyfin returned an invalid HLS playlist.") }
        let lines = text.components(separatedBy: .newlines)
        if depth == 0, lines.contains(where: { $0.hasPrefix("#EXT-X-STREAM-INF:") }),
           let variant = lines.first(where: { !$0.trimmingCharacters(in: .whitespaces).isEmpty && !$0.hasPrefix("#") }) {
            guard let child = URL(string: variant.trimmingCharacters(in: .whitespacesAndNewlines), relativeTo: url)?.absoluteURL else { throw URLError(.badURL) }
            let safe = try ApplePlayback.streamURL(child.absoluteString, server: server, token: token)
            try await checkPlaylist(safe, depth: 1)
        } else {
            print("PRISM playback: media playlist segments=\(lines.filter { $0.hasPrefix("#EXTINF:") }.count)")
        }
    }
    private func startPlayer(_ url: URL, item: Media, revision: Int, canRetry: Bool) throws {
        #if os(iOS) || os(tvOS)
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try AVAudioSession.sharedInstance().setActive(true)
        #endif
        player.replaceCurrentItem(with: AVPlayerItem(url: url))
        player.play()
        // A periodic AVPlayer time observer may never fire when startup fails.
        // This cancellable monitor detects failures even before the first frame.
        playbackMonitor = Task { [weak self] in
            var startupSeconds = 0
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard !Task.isCancelled, let self, revision == self.playbackRevision else { return }
                let current = self.player.currentTime().seconds
                self.seconds = current.isFinite ? current : 0
                let total = self.player.currentItem?.duration.seconds ?? 0
                self.duration = total.isFinite ? total : (item.RunTimeTicks ?? 0) / 10_000_000
                if self.player.timeControlStatus == .playing { self.preparingPlayback = false }
                if self.preparingPlayback { startupSeconds += 1 }
                if self.player.currentItem?.status == .failed || startupSeconds >= 45 {
                    let failure = self.playerFailure(timedOut: startupSeconds >= 45)
                    print("PRISM playback: " + failure)
                    if canRetry {
                        do {
                            let fallback = try await self.playbackURL(item, forceTranscode: true)
                            guard !Task.isCancelled, revision == self.playbackRevision else { return }
                            try self.startPlayer(fallback, item: item, revision: revision, canRetry: false)
                        } catch {
                            if !Task.isCancelled, revision == self.playbackRevision { self.playbackFailed("Fallback stream: " + self.diagnostic(error)) }
                        }
                    } else { self.playbackFailed(failure) }
                    return
                }
            }
        }
    }
    private func diagnostic(_ error: Error) -> String {
        if let failure = error as? PlaybackFailure { return failure.message }
        let value = error as NSError
        // Never print localized descriptions or userInfo: they can contain authenticated URLs.
        var result = "\(value.domain) code \(value.code)"
        if let underlying = value.userInfo[NSUnderlyingErrorKey] as? NSError {
            result += " (underlying \(underlying.domain) \(underlying.code))"
        }
        return result
    }
    private func playerFailure(timedOut: Bool) -> String {
        var message = timedOut ? "Player startup timed out after 45 seconds." : "Apple player could not open the stream."
        if let error = player.currentItem?.error { message += " " + diagnostic(error) }
        if let event = player.currentItem?.errorLog()?.events.last {
            message += " Stream status \(event.errorStatusCode)."
        }
        return message
    }
    private func playbackFailed(_ reason: String) {
        print("PRISM playback failed: " + reason)
        stop()
        error = "Playback could not start. " + reason
    }
    func stop() {
        playbackRevision += 1
        playbackTask?.cancel(); playbackTask = nil
        playbackMonitor?.cancel(); playbackMonitor = nil
        preparingPlayback = false
        #if os(tvOS)
        tvPlayback.stop()
        #endif
        player.pause(); player.replaceCurrentItem(with: nil); playing = nil; seconds = 0; duration = 0
    }
    func artwork(_ item: Media) async -> Data? {
        guard !isDemo, !token.isEmpty, let url = try? endpoint("Items/\(try ServerAddress.id(item.id))/Images/Primary", query: [.init(name: "maxWidth", value: "500"), .init(name: "quality", value: "85")]) else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 15
        request.setValue(token, forHTTPHeaderField: "X-Emby-Token")
        guard let (data, response) = try? await network.data(for: request), (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return data
    }
    func demo() {
        signOut()
        isDemo = true
        items = [Media(Id: "prism-sample", Name: "PRISM Playback Sample", Type: "Video", Overview: "An original 30-second geometric sample bundled with PRISM. Try play, pause, seeking, layouts and full screen. No server or internet connection is used in the sample library.", ProductionYear: nil, RunTimeTicks: 300_000_000, ProviderIds: nil)]
    }
    func signOut() {
        SessionStore.clear()
        libraries = []; libraryID = ""
        isDemo = false
        sessionRevision += 1; reloadRevision += 1; busy = false; error = ""; episodes = []; finances = nil; password = ""
        stop(); selectionTask?.cancel(); token = ""; userID = ""; tmdbToken = ""; items = []; selected = nil
    }
}

struct PrismWindow: View {
    @State private var model = LibraryModel()
    var body: some View { PrismRoot(model: model).task { await model.restoreSession() } }
}

// Keep the AVPlayer in the model, never in a posture-specific view.
struct PrismRoot: View {
    @Bindable var model: LibraryModel
    @State private var mode: DisplayMode = .automatic
    @State private var hideSecondary = false
    @State private var pane = 0
    @State private var scrollRequest = 0
    @State private var showHelp = false
    @FocusState private var libraryTopFocused: Bool
    #if os(macOS)
    @State private var window: NSWindow?
    #endif

    var body: some View {
        Group {
            if model.token.isEmpty && !model.isDemo { login }
            else {
                GeometryReader { proxy in
                    let layout = PlaybackLayout.resolve(size: proxy.size, fold: divisionFrame(proxy), mode: mode)
                    ZStack(alignment: .topLeading) {
                        Color.black.ignoresSafeArea()
                        if model.playing != nil {
                            video.frame(width: layout.video.width, height: layout.video.height)
                                .offset(x: layout.video.minX, y: layout.video.minY)
                            if let secondary = layout.secondary {
                                if !hideSecondary {
                                    browser.frame(width: secondary.width, height: secondary.height)
                                        .offset(x: secondary.minX, y: secondary.minY)
                                }
                            }
                        } else { browser.frame(maxWidth: .infinity, maxHeight: .infinity) }
                    }
                }
            }
        }
        #if os(macOS)
        .background(WindowAccessor { window = $0 })
        .frame(minWidth: 640, minHeight: 400)
        #endif
        #if os(tvOS)
        .ignoresSafeArea(.all, edges: model.playing == nil ? [] : .all)
        .onExitCommand {
            if model.playing != nil { model.stop() }
            returnToTop()
        }
        #endif
        .sheet(isPresented: $showHelp) { HelpView() }
        .alert("PRISM", isPresented: Binding(get: { !model.error.isEmpty }, set: { if !$0 { model.error = "" } })) {
            Button("OK") { model.error = "" }
        } message: { Text(model.error) }
    }
    var login: some View {
        Form {
            Section { Text("PRISM").font(.largeTitle); Text("Connect to your own media server.") }
            TextField("https://your-server.example", text: $model.server).serverInput()
            TextField("Username", text: $model.username).accountInput()
            SecureField("Password", text: $model.password)
            Button(model.busy ? "Connecting…" : "Connect") { Task { await model.signIn() } }.disabled(model.busy)
            Button("Try sample library") { model.demo() }.disabled(model.busy)
            Button("Setup help & privacy") { showHelp = true }
            Text("Your session is saved securely in this device's Keychain. Your password is never saved. Use HTTPS outside a trusted home network.").font(.footnote)
        }
    }
    @ViewBuilder var video: some View {
        #if os(tvOS)
        TVPlaybackScreen(model: model)
        #else
        VStack(spacing: 0) {
            HStack {
                Button { model.stop() } label: { Label("Library", systemImage: "chevron.left") }
                Spacer()
                #if !os(tvOS)
                Menu {
                    Picker("Layout", selection: $mode) { ForEach(DisplayMode.allCases, id: \.self) { Text($0.rawValue).tag($0) } }
                } label: { Image(systemName: "rectangle.split.2x1") }.accessibilityLabel("Playback layout")
                Button { hideSecondary.toggle() } label: { Image(systemName: hideSecondary ? "eye.slash" : "eye") }
                    .accessibilityLabel(hideSecondary ? "Show secondary pane" : "Hide secondary pane")
                #endif
                Button {
                    #if os(macOS)
                    window?.toggleFullScreen(nil)
                    #else
                    mode = mode == .full ? .automatic : .full
                    #endif
                } label: { Image(systemName: "arrow.up.left.and.arrow.down.right") }.accessibilityLabel("Toggle full screen")
            }.padding(8).buttonStyle(.bordered)
            #if os(macOS)
            MacVideoPlayer(player: model.player)
            #else
            VideoPlayer(player: model.player)
                .overlay { if model.preparingPlayback { ProgressView("Preparing playback…").padding().background(.black.opacity(0.8)) } }
            #endif
            if model.duration > 0 { Text("\(PlaybackTime.remaining(duration: model.duration, elapsed: model.seconds)) remaining").font(.caption).monospacedDigit().padding(5) }
        }.background(.black)
        #endif
    }
    var browser: some View {
        #if os(tvOS)
        TVLibrary(model: model)
        #else
        VStack(spacing: 8) {
            HStack {
                Button("P R I S M") { returnToTop() }.font(.system(.headline, design: .monospaced)).focused($libraryTopFocused).accessibilityLabel("Return to top of library")
                Spacer()
                if model.playing != nil { Button("Now playing") { if let item = model.playing { model.select(item); pane = 1 } } }
                Button("Refresh") { Task { if model.isDemo { await model.reload() } else { await model.loadLibraries() }; model.items.shuffle() } }.disabled(model.busy)
                Button(model.isDemo ? "Exit sample" : "Sign out") { model.signOut(); pane = 0 }
            }.padding(.horizontal)
            if !model.isDemo {
                ScrollView(.horizontal) {
                    HStack(spacing: 20) {
                        ForEach(model.libraries) { library in
                            Button(library.Name) { pane = 0; Task { await model.changeLibrary(library) } }
                                .tint(model.libraryID == library.id ? .cyan : .gray)
                        }
                    }.padding(.horizontal, 32).padding(.vertical, 12)
                }
            }
            if model.isDemo { Text("Sample library • Offline").font(.caption).foregroundStyle(.secondary) }
            Button("Help & privacy") { showHelp = true }.font(.caption)
            Picker("Browse", selection: $pane) { Text("Library").tag(0); Text("Details").tag(1) }.pickerStyle(.segmented).padding(.horizontal)
            if pane == 0 {
                ScrollViewReader { scroll in
                    ScrollView {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: posterWidth), spacing: 24)], spacing: 28) {
                            ForEach(model.items) { item in
                                Button { model.select(item); pane = 1 } label: {
                                    PrismPoster(item: item, model: model)
                                }.buttonStyle(.plain).id(item.id)
                                    .accessibilityLabel("\(item.Name), \(item.Type ?? "Video")")
                            }
                        }.padding(32)
                        if model.items.isEmpty && !model.busy { Text("No movies or shows found. Add media in your server settings, then refresh.") }
                    }
                    .onChange(of: scrollRequest) { _, _ in if let first = model.items.first { withAnimation { scroll.scrollTo(first.id, anchor: .top) } } }
                    .overlay { if model.busy { ProgressView() } }
                }
            } else { details }
        }.padding(.top, 8).background(.background)
        #endif
    }
    var posterWidth: CGFloat {
        #if os(tvOS)
        230
        #else
        140
        #endif
    }
    var details: some View {
        ScrollView {
            if let item = model.selected {
                VStack(alignment: .leading, spacing: 16) {
                    PrismPoster(item: item, model: model).frame(width: posterWidth)
                    Text(item.Name).font(.system(.largeTitle, design: .serif))
                    if let year = item.ProductionYear { Text(String(year)).foregroundStyle(.secondary) }
                    if item.Type == "Series" || item.Type == "MusicAlbum" {
                        ForEach(model.episodes) { episode in Button("Play \(episode.Name)") { model.play(episode) } }
                    } else { Button("Play") { model.play(item) }.buttonStyle(.borderedProminent) }
                    Text(item.Overview ?? "No overview is available.")
                    if item.Type == "Movie" && !model.isDemo {
                    LabeledContent("Budget", value: money(model.finances?.budget))
                    LabeledContent("Box office", value: money(model.finances?.revenue))
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Optional TMDb details").font(.headline)
                        SecureField("Your TMDb read access token", text: $model.tmdbToken).accountInput()
                        Button("Load financial details") { model.select(item) }
                        Text("Uses your own token. Data provided by TMDb; unavailable values are not treated as zero.").font(.caption)
                    }
                    }
                }.padding()
            } else { Text("Choose a title from Library.").padding() }
        }
    }
    func returnToTop() {
        pane = 0
        scrollRequest += 1
        libraryTopFocused = true
    }
    func money(_ amount: Double?) -> String { guard let amount, amount > 0 else { return "Unavailable" }; return amount.formatted(.currency(code: "USD").precision(.fractionLength(0))) }
}
