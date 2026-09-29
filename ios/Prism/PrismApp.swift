import SwiftUI
import AVKit

@main
struct PrismApp: App {
    @State private var model = LibraryModel()
    var body: some Scene {
        WindowGroup {
            PrismRoot(model: model)
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
    let Type: String?
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
    // Credentials stay in memory for this native preview. No shared/demo server.
    var server = ""
    var username = ""
    var password = ""
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
        guard var parts = URLComponents(string: server.trimmingCharacters(in: .whitespacesAndNewlines)),
              ["https", "http"].contains(parts.scheme), parts.host != nil,
              parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil else {
            throw URLError(.badURL)
        }
        parts.path = parts.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        parts.path = "/" + ([parts.path, path].filter { !$0.isEmpty }.joined(separator: "/"))
        parts.queryItems = query.isEmpty ? nil : query
        guard let url = parts.url else { throw URLError(.badURL) }; return url
    }
    func request<T: Decodable>(_ path: String, query: [URLQueryItem] = [], body: Data? = nil) async throws -> T {
        var request = URLRequest(url: try endpoint(path, query: query))
        request.timeoutInterval = 20
        request.setValue("MediaBrowser Client=\"PRISM iOS\", Device=\"iPhone\", DeviceId=\"\(deviceID)\", Version=\"0.15.0\"", forHTTPHeaderField: "Authorization")
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
        } catch { self.error = "Could not sign in. Check your server address, network access and account. Use HTTPS for a remote server." }
    }
    func reload() async {
        guard !token.isEmpty else { return }
        reloadRevision += 1
        let revision = reloadRevision
        let session = sessionRevision
        busy = true; defer { if revision == reloadRevision && session == sessionRevision { busy = false } }
        do {
            let result: Items = try await request("Users/\(userID)/Items", query: [
                .init(name: "Recursive", value: "true"), .init(name: "IncludeItemTypes", value: "Movie,Series,Video"),
                .init(name: "Fields", value: "Overview,ProviderIds"), .init(name: "SortBy", value: "SortName")
            ])
            guard revision == reloadRevision && session == sessionRevision else { return }
            items = result.Items
        } catch { if revision == reloadRevision && session == sessionRevision { self.error = "Your library could not be loaded. Check the server and retry." } }
    }
    func select(_ item: Media) {
        selectionTask?.cancel(); selected = item; episodes = []; finances = nil
        selectionTask = Task {
            do {
                if item.Type == "Series" {
                    let result: Items = try await request("Shows/\(item.id)/Episodes", query: [.init(name: "userId", value: userID), .init(name: "Fields", value: "Overview,ProviderIds")])
                    if !Task.isCancelled { episodes = result.Items }
                }
                if item.Type == "Movie", !tmdbToken.isEmpty, let id = item.ProviderIds?["Tmdb"] ?? item.ProviderIds?["tmdb"], Int(id) != nil {
                    var request = URLRequest(url: URL(string: "https://api.themoviedb.org/3/movie/\(id)")!)
                    request.setValue("Bearer \(tmdbToken)", forHTTPHeaderField: "Authorization")
                    let (data, response) = try await network.data(for: request)
                    if (response as? HTTPURLResponse)?.statusCode == 200, !Task.isCancelled { finances = try JSONDecoder().decode(Finances.self, from: data) }
                }
            } catch { if !Task.isCancelled { self.error = "Details could not be loaded. Please retry." } }
        }
    }
    func play(_ item: Media) {
        do {
            // AVPlayer direct play. Server transcoding negotiation is not part of this preview.
            let url = try endpoint("Videos/\(item.id)/stream", query: [.init(name: "static", value: "true"), .init(name: "api_key", value: token)])
            player.replaceCurrentItem(with: AVPlayerItem(url: url))
            playing = item; seconds = 0; duration = 0; player.play()
            if observer == nil {
                observer = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 1, preferredTimescale: 600), queue: .main) { [weak self] time in
                    Task { @MainActor in
                        guard let self else { return }
                        self.seconds = time.seconds.isFinite ? time.seconds : 0
                        let value = self.player.currentItem?.duration.seconds ?? 0
                        self.duration = value.isFinite ? value : 0
                        if self.player.currentItem?.status == .failed { self.error = "This file could not play. Try an iOS-compatible MP4 (H.264/HEVC with AAC audio)." }
                    }
                }
            }
        } catch { self.error = "The media address is invalid." }
    }
    func stop() {
        player.pause(); player.replaceCurrentItem(with: nil); playing = nil; seconds = 0; duration = 0
        if let observer { player.removeTimeObserver(observer); self.observer = nil }
    }
    func signOut() {
        sessionRevision += 1; reloadRevision += 1; busy = false; error = ""; episodes = []; finances = nil; password = ""
        stop(); selectionTask?.cancel(); token = ""; userID = ""; tmdbToken = ""; items = []; selected = nil
    }
}

// Keep the AVPlayer in the model, never in a posture-specific view.
struct PrismRoot: View {
    @Bindable var model: LibraryModel
    @State private var mode: DisplayMode = .automatic
    @State private var hideSecondary = false
    @State private var pane = 0
    enum DisplayMode: String, CaseIterable { case automatic = "Automatic", full = "Full screen", stacked = "Top / bottom", sideBySide = "Side by side" }

    var body: some View {
        Group {
            if model.token.isEmpty { login }
            else {
                GeometryReader { proxy in
                    let divisions = proxy.reservedRegions(kind: .division)
                    let fold = divisions.first?.frame
                    let layout = layoutFor(size: proxy.size, fold: fold)
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
        .alert("PRISM", isPresented: Binding(get: { !model.error.isEmpty }, set: { if !$0 { model.error = "" } })) {
            Button("OK") { model.error = "" }
        } message: { Text(model.error) }
    }
    func layoutFor(size: CGSize, fold: CGRect?) -> (video: CGRect, secondary: CGRect?) {
        let whole = CGRect(origin: .zero, size: size)
        if mode == .full { return (whole, nil) }
        // Active reserved regions, rather than a guessed hinge angle, define safe panes.
        if let fold, fold.width > fold.height, fold.minY > 0, fold.maxY < size.height {
            return (CGRect(x: 0, y: 0, width: size.width, height: fold.minY), CGRect(x: 0, y: fold.maxY, width: size.width, height: size.height - fold.maxY))
        }
        if let fold, fold.minX > 0, fold.maxX < size.width {
            return (CGRect(x: 0, y: 0, width: fold.minX, height: size.height), CGRect(x: fold.maxX, y: 0, width: size.width - fold.maxX, height: size.height))
        }
        if mode == .stacked { return (CGRect(x: 0, y: 0, width: size.width, height: size.height / 2), CGRect(x: 0, y: size.height / 2, width: size.width, height: size.height / 2)) }
        if mode == .sideBySide && size.width >= 600 { return (CGRect(x: 0, y: 0, width: size.width / 2, height: size.height), CGRect(x: size.width / 2, y: 0, width: size.width / 2, height: size.height)) }
        // Flat/open, closed outer display and narrow multitasking windows use one pane.
        return (whole, nil)
    }
    var login: some View {
        Form {
            Section { Text("PRISM").font(.largeTitle); Text("Connect to your own media server.") }
            TextField("https://your-server.example", text: $model.server).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
            TextField("Username", text: $model.username).textInputAutocapitalization(.never).autocorrectionDisabled()
            SecureField("Password", text: $model.password)
            Button(model.busy ? "Connecting…" : "Connect") { Task { await model.signIn() } }.disabled(model.busy)
            Text("This native preview keeps your session in memory. Sign in again after quitting. Use HTTPS outside a trusted home network.").font(.footnote)
        }
    }
    var video: some View {
        VStack(spacing: 0) {
            HStack {
                Button { model.stop() } label: { Label("Library", systemImage: "chevron.left") }
                Spacer()
                Menu {
                    Picker("Layout", selection: $mode) { ForEach(DisplayMode.allCases, id: \.self) { Text($0.rawValue).tag($0) } }
                } label: { Image(systemName: "rectangle.split.2x1") }.accessibilityLabel("Playback layout")
                Button { hideSecondary.toggle() } label: { Image(systemName: hideSecondary ? "eye.slash" : "eye") }
                    .accessibilityLabel(hideSecondary ? "Show secondary pane" : "Hide secondary pane")
                Button { mode = mode == .full ? .automatic : .full } label: { Image(systemName: "arrow.up.left.and.arrow.down.right") }.accessibilityLabel("Full screen layout")
            }.padding(8).buttonStyle(.bordered)
            VideoPlayer(player: model.player)
            if model.duration > 0 { Text("\(Int(max(0, model.duration - model.seconds) / 60)) min remaining").font(.caption).monospacedDigit().padding(5) }
        }.background(.black)
    }
    var browser: some View {
        VStack(spacing: 8) {
            HStack {
                Text("PRISM").font(.headline)
                Spacer()
                if model.playing != nil { Button("Now playing") { if let item = model.playing { model.select(item); pane = 1 } } }
                Button("Refresh") { Task { await model.reload() } }.disabled(model.busy)
                Button("Sign out") { model.signOut() }
            }.padding(.horizontal)
            Picker("Browse", selection: $pane) { Text("Library").tag(0); Text("Details").tag(1) }.pickerStyle(.segmented).padding(.horizontal)
            if pane == 0 {
                List(model.items) { item in
                    Button { model.select(item); pane = 1 } label: {
                        VStack(alignment: .leading) { Text(item.Name); Text(item.Type ?? "Video").font(.caption).foregroundStyle(.secondary) }
                    }
                }.overlay { if model.busy { ProgressView() } }
            } else { details }
        }.padding(.top, 8).background(Color(.systemBackground))
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
                    DisclosureGroup("Optional TMDb details") {
                        SecureField("Your TMDb read access token", text: $model.tmdbToken).textInputAutocapitalization(.never).autocorrectionDisabled()
                        Button("Load financial details") { model.select(item) }
                        Text("Uses your own token. Data provided by TMDb; unavailable values are not treated as zero.").font(.caption)
                    }
                }.padding()
            } else { Text("Choose a title from Library.").padding() }
        }
    }
    func money(_ amount: Double?) -> String { guard let amount, amount > 0 else { return "Unavailable" }; return amount.formatted(.currency(code: "USD").precision(.fractionLength(0))) }
}
