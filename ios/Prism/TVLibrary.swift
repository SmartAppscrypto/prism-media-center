#if os(tvOS)
import SwiftUI

struct TVLibrary: View {
    @Bindable var model: LibraryModel
    @State private var detail = false
    @State private var query = ""
    @State private var sort = "Title"
    @State private var topRequest = 0
    @State private var showHelp = false
    @FocusState private var topFocused: Bool
    @FocusState private var detailFocus: String?
    private let background = Color(red: 0.02, green: 0.02, blue: 0.024)
    private var titles: [Media] {
        let result = model.items.filter { query.isEmpty || $0.Name.localizedCaseInsensitiveContains(query) }
        switch sort {
        case "Year": return result.sorted { ($0.ProductionYear ?? 0) > ($1.ProductionYear ?? 0) }
        case "Random": return result
        default: return result.sorted { $0.Name.localizedStandardCompare($1.Name) == .orderedAscending }
        }
    }
    var body: some View {
        VStack(spacing: 28) {
            HStack(spacing: 32) {
                Button("P R I S M") { toTop() }
                    .font(.system(.title2, design: .monospaced)).focused($topFocused)
                    .accessibilityLabel("Return to top of library")
                Spacer()
                Menu(model.libraries.first(where: { $0.id == model.libraryID })?.Name ?? "Sample library") {
                    ForEach(model.libraries) { library in
                        Button(library.Name) { detail = false; query = ""; Task { await model.changeLibrary(library) } }
                    }
                }.disabled(model.isDemo)
                Button { Task {
                    if model.isDemo { await model.reload() } else { await model.loadLibraries() }
                    if sort == "Random" { model.items.shuffle() }
                } } label: { Image(systemName: "arrow.clockwise") }.accessibilityLabel("Refresh library")
                Menu {
                    Button("Help & privacy") { showHelp = true }
                    Button(model.isDemo ? "Exit sample" : "Sign out") { model.signOut() }
                } label: { Image(systemName: "gearshape") }.accessibilityLabel("Settings")
            }
            if detail, let item = model.selected {
                titleDetails(item)
            } else {
                HStack(spacing: 28) {
                    TextField("Search this library", text: $query).frame(maxWidth: 600)
                    Spacer()
                    Text("\(titles.count) \(titles.count == 1 ? "title" : "titles")").font(.caption.monospaced()).foregroundStyle(.secondary)
                    Menu("Sort: \(sort)") {
                        ForEach(["Title", "Year", "Random"], id: \.self) { value in
                            Button(value) { sort = value; if value == "Random" { model.items.shuffle() } }
                        }
                    }
                }
                ScrollViewReader { scroll in
                    ScrollView {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: 32)], spacing: 36) {
                            ForEach(titles) { item in
                                Button { model.select(item); detail = true } label: {
                                    VStack(alignment: .leading, spacing: 12) {
                                        PrismPoster(item: item, model: model).clipShape(RoundedRectangle(cornerRadius: 8))
                                        Text(item.Name).font(.system(size: 22, weight: .medium)).lineLimit(1)
                                        Text(item.ProductionYear.map(String.init) ?? item.Type ?? "Video")
                                            .font(.system(size: 17, design: .monospaced)).foregroundStyle(.secondary)
                                    }
                                }.buttonStyle(TVPosterStyle()).id(item.id).accessibilityLabel(item.Name)
                            }
                        }.padding(12)
                        if titles.isEmpty && !model.busy {
                            ContentUnavailableView(query.isEmpty ? "No media in this library" : "No matching titles", systemImage: "film")
                        }
                    }.onChange(of: topRequest) { _, _ in
                        if let first = titles.first { withAnimation { scroll.scrollTo(first.id, anchor: .top) } }
                    }
                }
            }
        }
        .padding(.horizontal, 60).padding(.top, 30)
        .background(background.ignoresSafeArea())
        .overlay { if model.busy { ProgressView().padding(30).background(.black.opacity(0.8)) } }
        .sheet(isPresented: $showHelp) { HelpView() }
        .onExitCommand { toTop() }
    }
    private func toTop() { detail = false; topRequest += 1; topFocused = true }
    private func titleDetails(_ item: Media) -> some View {
        HStack(alignment: .top, spacing: 64) {
            PrismPoster(item: item, model: model).frame(width: 360).clipShape(RoundedRectangle(cornerRadius: 10))
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    Text(item.Name).font(.system(size: 54, weight: .regular, design: .serif))
                    HStack(spacing: 24) {
                        if let year = item.ProductionYear { Text(String(year)) }
                        if let runtime = item.RunTimeTicks, runtime > 0 { Text(runtime < 600_000_000 ? "<1 min" : "\(Int(runtime / 600_000_000)) min") }
                        Text(item.Type ?? "Video")
                    }.font(.callout.monospaced()).foregroundStyle(.secondary)
                    if item.Type == "Series" || item.Type == "MusicAlbum" {
                        if model.episodes.isEmpty { Text("No episodes or tracks loaded yet.").foregroundStyle(.secondary) }
                        ForEach(model.episodes) { episode in
                            Button { model.play(episode) } label: { Label(episode.Name, systemImage: "play.fill") }
                                .focused($detailFocus, equals: episode.id)
                                .onAppear { if episode.id == model.episodes.first?.id { detailFocus = episode.id } }
                        }
                    } else {
                        Button { model.play(item) } label: { Label("Play", systemImage: "play.fill") }
                            .accessibilityIdentifier("play-title")
                            .focused($detailFocus, equals: "play")
                            .onAppear { detailFocus = "play" }
                    }
                    Text(item.Overview ?? "No description is available for this title.").font(.body).foregroundStyle(.secondary)
                    Button("Back to gallery") { detail = false }
                }.frame(maxWidth: .infinity, alignment: .leading).padding(16)
            }
        }.padding(.top, 12)
    }
}

private struct TVPosterStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { Poster(configuration: configuration) }
    private struct Poster: View {
        let configuration: ButtonStyle.Configuration
        @Environment(\.isFocused) private var focused
        var body: some View {
            configuration.label.padding(6)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(focused ? 1 : 0), lineWidth: 3))
                .scaleEffect(focused ? 1.04 : 1)
                .opacity(configuration.isPressed ? 0.75 : 1)
                .animation(.easeOut(duration: 0.15), value: focused)
        }
    }
}
#endif
