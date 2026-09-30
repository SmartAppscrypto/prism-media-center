# PRISM native Apple client

SwiftUI and AVKit client targets for iPhone/iPad (`Prism`), Apple TV (`PrismTV`) and sandboxed Mac (`PrismMac`). These are under preparation and are **not on the App Store**. They connect to each user's own Jellyfin server; no publisher server or credential is included.

See the [App Store checklist](../docs/apple/APP-STORE-CHECKLIST.md), [listing draft](../docs/apple/STORE-LISTING.md) and [privacy policy](../docs/apple/PRIVACY.md).

## Build

Install full Xcode and XcodeGen, then run:

```sh
cd ios
xcodegen generate
xcodebuild -project Prism.xcodeproj -scheme Prism -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
xcodebuild -project Prism.xcodeproj -scheme PrismTV -sdk appletvsimulator CODE_SIGNING_ALLOWED=NO build
xcodebuild -project Prism.xcodeproj -scheme PrismMac -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO test
```

Select Xcode 27.1 beta and pass `SWIFT_ACTIVE_COMPILATION_CONDITIONS=PRISM_DUO_SDK` for Duo geometry validation. iOS 17 remains the minimum OS, with availability checks around the iOS 27.1 APIs. Standard 27.0 builds omit those APIs. Apple's current beta acceptance is for TestFlight; verify release eligibility separately.

`PrismMac` uses only outgoing-network sandbox permission. Signing requires the publisher's own Apple Developer team; see `scripts/archive.sh`. No signing credentials belong in this repository.

## Included behavior

- Memory-only login to an independently configured server; no default address or stored password.
- Movie/show library, episode selection, details, refresh/shuffle and PRISM return-to-top.
- Native direct playback, runtime remaining, player layouts and a dedicated Mac fullscreen button.
- Apple TV remote Play/Pause and Back to library/top.
- One player instance per window, independent of layout changes. Duo builds avoid active division regions, offer a hidden lower pane and retain full-window behavior when no division is active.
- Offline original geometric playback sample and in-app setup/privacy help.

Supported media must be playable by AVFoundation, such as H.264/HEVC MP4 with AAC. Automatic transcoding, downloads, music features, playback-history sync and Watch app are not included. Existing Electron/libVLC builds have a different feature set. No claim of complete device validation is made by a successful compiler run.

The original 30-second silent `Resources/PrismSample.mp4` was generated from geometric primitives with FFmpeg; it contains no third-party footage or soundtrack. TV branding reproduces the existing PRISM wordmark; regenerate with `swift scripts/generate-tv-assets.swift Prism/Assets.xcassets/TVBrand.brandassets`.
