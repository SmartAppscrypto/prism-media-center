import Foundation

struct LibrarySection: Decodable, Identifiable, Hashable {
    let Id: String
    let Name: String
    let CollectionType: String?
    var id: String { Id }
    var itemTypes: String {
        switch CollectionType {
        case "movies": "Movie"
        case "tvshows": "Series"
        case "homevideos": "Video"
        case "music": "MusicAlbum"
        default: "Movie,Series,Video,MusicAlbum"
        }
    }
}
struct LibrarySections: Decodable { let Items: [LibrarySection] }

struct SavedSession: Codable, Equatable {
    let server: String
    let username: String
    let token: String
    let userID: String
}
