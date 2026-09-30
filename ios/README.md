# PRISM native Apple client

Native SwiftUI clients, with TVVLCKit on Apple TV and AVKit on other targets. Client targets for iPhone/iPad (`Prism`), Apple TV (`PrismTV`) and sandboxed Mac (`PrismMac`). These are under preparation and are **not on the App Store**. They connect to each user's own Jellyfin server; no publisher server or credential is included.

See the [App Store checklist](../docs/apple/APP-STORE-CHECKLIST.md), [listing draft](../docs/apple/STORE-LISTING.md) and [privacy policy](../docs/apple/PRIVACY.md).

## Build

Install full Xcode and XcodeGen, then run:

```sh
cd ios
bash scripts/bootstrap-vlc.sh
xcodegen generate
xcodebuild -project Prism.xcodeproj -scheme Prism -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
xcodebuild -project Prism.xcodeproj -scheme PrismTV -sdk appletvsimulator CODE_SIGNING_ALLOWED=NO build
xcodebuild -project Prism.xcodeproj -scheme PrismMac -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO test
```

Select Xcode 27.1 beta and pass `SWIFT_ACTIVE_COMPILATION_CONDITIONS=PRISM_DUO_SDK` for Duo geometry validation. iOS 17 remains the minimum OS, with availability checks around the iOS 27.1 APIs. Standard 27.0 builds omit those APIs. Apple's current beta acceptance is for TestFlight; verify release eligibility separately.

`PrismMac` uses only outgoing-network sandbox permission. Signing requires the publisher's own Apple Developer team; see `scripts/archive.sh`. No signing credentials belong in this repository.

## Included behavior

- Keychain-backed session restoration; no default server address or stored password. Sign-out removes the saved session.
- Actual Jellyfin library sections, matching desktop `getViews`/`getLibrary`: movies, shows, home videos and music albums; episodes and album tracks, details, refresh/shuffle and return-to-top.
- Apple TV: native VLC direct-source playback, full-screen video, auto-hiding controls, seek and runtime remaining. Other platforms: AVFoundation playback and a Mac fullscreen button.
- Apple TV remote Play/Pause and Back to library/top.
- One player instance per window, independent of layout changes. Duo builds avoid active division regions, offer a hidden lower pane and retain full-window behavior when no division is active.
- Offline original geometric playback sample and in-app setup/privacy help.

Apple TV links the official stable TVVLCKit 3.7.3 binary from VideoLAN, verified against the SHA-256 in its CocoaPods spec. It plays original streams without requiring NAS transcoding. Other targets use AVFoundation-compatible streams. Downloads, playback-history sync and a Watch app are not included. Existing Electron/libVLC builds have a different feature set. No claim of complete device validation is made by a successful compiler run.

The original 30-second silent `Resources/PrismSample.mp4` was generated from geometric primitives with FFmpeg; it contains no third-party footage or soundtrack. TV branding reproduces the existing PRISM wordmark; regenerate with `swift scripts/generate-tv-assets.swift Prism/Assets.xcassets/TVBrand.brandassets`.

## VLC dependency and reproducible builds

`bootstrap-vlc.sh` downloads the official TVVLCKit 3.7.3 release (VLCKit `319ed2c0`, libVLC `79128878`) and checks its published SHA-256. `Vendor/` is intentionally ignored. The LGPL notice is bundled in Resources/Licenses. Upstream source and build scripts: https://code.videolan.org/videolan/VLCKit. Keep the license and source/build information with distributed binaries; App Store packaging remains a separate release gate.

Personal installs: regenerate the project, select your Personal Team for PrismTV, choose your paired TV, and run. Do not commit a personal Team ID. A rebuild retains the Keychain session for the same signing identity and bundle identifier. This does not remove Apple's provisioning expiry.
