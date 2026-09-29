# PRISM native iOS / iPhone Duo development preview

This is a separate SwiftUI/AVKit client, not an Electron wrapper or part of the desktop installers. It requires Xcode 27.1 with the iOS 27.1 SDK and XcodeGen. It has not been validated on a physical Duo. No signed IPA or App Store release is provided.

Generate with `xcodegen generate` from `ios`, then open `Prism.xcodeproj`. Select your own signing team and bundle ID to run on your devices. Build for an iPhone Duo simulator first. `xcodebuild -project Prism.xcodeproj -scheme Prism -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build` performs an unsigned simulator build.

The client connects to the user's Jellyfin server, browses movies/series/episodes, plays AVPlayer-compatible direct streams, and optionally loads financial details using the user's own TMDb token. Session/password/TMDb credentials are not persisted. HTTPS is required for remote servers; local-network access is requested by iOS. Transcoding negotiation, secure persistent login, rich posters and App Store packaging remain follow-up work before production distribution.

## Layout behavior

| Configuration | Automatic behavior |
| --- | --- |
| Open flat, playing | One full-window player |
| Open flat, idle | Full-window library |
| Tabletop with horizontal division | Video above fold; browse/details below |
| Partially folded like a book | Video beside fold; browse/details in other region |
| Closed / outer display | Same scene and player adapt to the new geometry |
| Split view with another app | Available scene bounds define the app size; narrow windows use a single pane |
| Manual Top / bottom | Equal stacked panes without requiring fold hardware |
| Manual Side by side | Equal columns in wide windows; one pane when narrower than 600 points |
| Eye toggled | Secondary pane becomes black; player stays in its safe pane |
| Manual Full screen | One player across the current app window; system multitasking bounds still apply |

Playback ownership stays in LibraryModel while views resize. The system selects the active display; the app does not force an inactive outer display on or use camera-only accessory APIs. The eye control hides app content, not the physical display/backlight. A single OLED panel is not two independently switchable screens.

## Verification required before shipping

Use Device Hub's Duo poses, rotate each pose and test transitions during playback and pause: flat -> tabletop -> book -> closed -> reopened. Confirm playhead continuity, controls clear of the division/camera regions, focus and VoiceOver labels, Dynamic Type, safe areas, split-view resizing, eye hide/restore, episode switching, network loss, and app background/foreground. Confirm server compatibility and unsupported-codec errors. Validate manual modes separately from Automatic.

Apple's implementation sources:
- [Adaptive layouts and reserved regions](https://developer.apple.com/videos/play/tech-talks/111463/): the implementation queries GeometryProxy.reservedRegions(kind: .division), not hinge-angle thresholds.
- [Preparing apps and screen transitions](https://developer.apple.com/videos/play/tech-talks/111461/): use current scene geometry and preserve app state as displays change.
- [Scenes and displays](https://developer.apple.com/videos/play/tech-talks/111464/): system-managed display/accessory availability; outer camera accessory is not a general movie-display API.
- [Design guidance](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo).
