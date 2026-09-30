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
struct Finances: Decodable { let budget: Double?; let revenue: Double? }

@MainActor @Observable
final class LibraryModel {
    // Session credentials are memory-only; never written to preferences or logs.
    var server = ""
    var username = ""
    var password = ""
    var isDemo = false
    var token = ""
    var userID = ""
    var items: [Media] = []
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
    private var observer: Any?
    private var deviceID = UUID().uuidString
    private let network = URLSession(configuration: .ephemeral, delegate: NoRedirects(), delegateQueue: nil)
    private var selectionTask: Task<Void, Never>?
    private var sessionRevision = 0
    private var reloadRevision = 0

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
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else { throw URLError(.userAuthenticationRequired) }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .custom { keys in
            let key = keys.last!.stringValue
            return DTOKey(stringValue: key.prefix(1).uppercased() + key.dropFirst())
        }
        return try decoder.decode(T.self, from: data)
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
            await reload()
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
            let result: Items = try await request("Users/\(try ServerAddress.id(userID))/Items", query: [
                .init(name: "Recursive", value: "true"), .init(name: "IncludeItemTypes", value: "Movie,Series,Video"),
                .init(name: "Fields", value: "Overview,ProviderIds"), .init(name: "SortBy", value: "SortName")
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
        do {
            // Direct play is intentionally limited to formats supported by AVFoundation.
            let url: URL
            if isDemo {
                guard let sample = Bundle.main.url(forResource: "PrismSample", withExtension: "mp4") else { throw URLError(.fileDoesNotExist) }
                url = sample
            } else {
                url = try endpoint("Videos/\(try ServerAddress.id(item.id))/stream", query: [.init(name: "static", value: "true"), .init(name: "api_key", value: token)])
            }
            #if os(iOS) || os(tvOS)
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
            try AVAudioSession.sharedInstance().setActive(true)
            #endif
            player.replaceCurrentItem(with: AVPlayerItem(url: url))
            playing = item; seconds = 0; duration = 0; player.play()
            if observer == nil {
                observer = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 1, preferredTimescale: 600), queue: .main) { [weak self] time in
                    Task { @MainActor in
                        guard let self else { return }
                        self.seconds = time.seconds.isFinite ? time.seconds : 0
                        let value = self.player.currentItem?.duration.seconds ?? 0
                        self.duration = value.isFinite ? value : 0
                        if self.player.currentItem?.status == .failed { self.stop(); self.error = "This file could not play. Use an Apple-compatible MP4 (H.264/HEVC with AAC audio)." }
                    }
                }
            }
        } catch { self.error = "The media address is invalid." }
    }
    func stop() {
        player.pause(); player.replaceCurrentItem(with: nil); playing = nil; seconds = 0; duration = 0
        if let observer { player.removeTimeObserver(observer); self.observer = nil }
    }
    func demo() {
        signOut()
        isDemo = true
        items = [Media(Id: "prism-sample", Name: "PRISM Playback Sample", Type: "Video", Overview: "An original 30-second geometric sample bundled with PRISM. Try play, pause, seeking, layouts and full screen. No server or internet connection is used in the sample library.", ProductionYear: nil, RunTimeTicks: 300_000_000, ProviderIds: nil)]
    }
    func signOut() {
        isDemo = false
        sessionRevision += 1; reloadRevision += 1; busy = false; error = ""; episodes = []; finances = nil; password = ""
        stop(); selectionTask?.cancel(); token = ""; userID = ""; tmdbToken = ""; items = []; selected = nil
    }
}

struct PrismWindow: View {
    @State private var model = LibraryModel()
    var body: some View { PrismRoot(model: model).onDisappear { model.stop() } }
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
        .onPlayPauseCommand {
            guard model.playing != nil else { return }
            if model.player.timeControlStatus == .playing { model.player.pause() } else { model.player.play() }
        }
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
            Text("Your sign-in stays in memory only. Sign in again after quitting. Use HTTPS outside a trusted home network.").font(.footnote)
        }
    }
    var video: some View {
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
            VideoPlayer(player: model.player)
            if model.duration > 0 { Text("\(Int(max(0, model.duration - model.seconds) / 60)) min remaining").font(.caption).monospacedDigit().padding(5) }
        }.background(.black)
    }
    var browser: some View {
        VStack(spacing: 8) {
            HStack {
                Button("PRISM") { returnToTop() }.font(.headline).focused($libraryTopFocused).accessibilityLabel("Return to top of library")
                Spacer()
                if model.playing != nil { Button("Now playing") { if let item = model.playing { model.select(item); pane = 1 } } }
                Button("Refresh") { Task { await model.reload(); model.items.shuffle() } }.disabled(model.busy)
                Button(model.isDemo ? "Exit sample" : "Sign out") { model.signOut(); pane = 0 }
            }.padding(.horizontal)
            if model.isDemo { Text("Sample library • Offline").font(.caption).foregroundStyle(.secondary) }
            Button("Help & privacy") { showHelp = true }.font(.caption)
            Picker("Browse", selection: $pane) { Text("Library").tag(0); Text("Details").tag(1) }.pickerStyle(.segmented).padding(.horizontal)
            if pane == 0 {
                ScrollViewReader { scroll in
                    List {
                        Color.clear.frame(height: 1).id("library-top").accessibilityHidden(true)
                        if model.items.isEmpty && !model.busy { Text("No movies or shows found. Add media in your server settings, then refresh.") }
                        ForEach(model.items) { item in
                            Button { model.select(item); pane = 1 } label: {
                                VStack(alignment: .leading) { Text(item.Name); Text(item.Type ?? "Video").font(.caption).foregroundStyle(.secondary) }
                            }
                        }
                    }
                    .onChange(of: scrollRequest) { _, _ in withAnimation { scroll.scrollTo("library-top", anchor: .top) } }
                    .overlay { if model.busy { ProgressView() } }
                }
            } else { details }
        }.padding(.top, 8).background(.background)
    }
    var details: some View {
        ScrollView {
            if let item = model.selected {
                VStack(alignment: .leading, spacing: 16) {
                    Text(item.Name).font(.title2.bold())
                    if let year = item.ProductionYear { Text(String(year)).foregroundStyle(.secondary) }
                    if item.Type == "Series" {
                        ForEach(model.episodes) { episode in Button("Play \(episode.Name)") { model.play(episode) } }
                    } else { Button("Play") { model.play(item) }.buttonStyle(.borderedProminent) }
                    Text(item.Overview ?? "No overview is available.")
                    LabeledContent("Budget", value: money(model.finances?.budget))
                    LabeledContent("Box office", value: money(model.finances?.revenue))
                    if !model.isDemo {
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
