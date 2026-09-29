import Foundation

enum DisplayMode: String, CaseIterable {
    case automatic = "Automatic", full = "Full screen", stacked = "Top / bottom", sideBySide = "Side by side"
}

struct PlaybackLayout {
    let video: CGRect
    let secondary: CGRect?

    static func resolve(size: CGSize, fold: CGRect?, mode: DisplayMode) -> Self {
        let whole = CGRect(origin: .zero, size: size)
        // A physical division always takes priority: controls must never straddle it.
        if let fold, fold.width > fold.height, fold.minY > 0, fold.maxY < size.height {
            return Self(video: CGRect(x: 0, y: 0, width: size.width, height: fold.minY),
                        secondary: CGRect(x: 0, y: fold.maxY, width: size.width, height: size.height - fold.maxY))
        }
        if let fold, fold.height > fold.width, fold.minX > 0, fold.maxX < size.width {
            return Self(video: CGRect(x: 0, y: 0, width: fold.minX, height: size.height),
                        secondary: CGRect(x: fold.maxX, y: 0, width: size.width - fold.maxX, height: size.height))
        }
        if mode == .stacked {
            return Self(video: CGRect(x: 0, y: 0, width: size.width, height: size.height / 2),
                        secondary: CGRect(x: 0, y: size.height / 2, width: size.width, height: size.height / 2))
        }
        if mode == .sideBySide && size.width >= 600 {
            return Self(video: CGRect(x: 0, y: 0, width: size.width / 2, height: size.height),
                        secondary: CGRect(x: size.width / 2, y: 0, width: size.width / 2, height: size.height))
        }
        return Self(video: whole, secondary: nil)
    }
}
