import Foundation

enum PlaybackTime {
    static func remaining(duration: Double, elapsed: Double) -> String {
        guard duration.isFinite, elapsed.isFinite else { return "--:--" }
        let total = Int(min(9_999_999, max(0, ceil(duration - elapsed))))
        if total >= 3600 { return String(format: "%d:%02d:%02d", total / 3600, total / 60 % 60, total % 60) }
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
