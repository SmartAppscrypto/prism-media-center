# PRISM Apple release checklist

**Current status: not submitted.** The publisher does not yet have an Apple Developer Program membership. No signing identity, provisioning profile, App Store Connect app record or signed upload exists. Free with no in-app purchases is confirmed.

## 1. Enroll — publisher action

Open [Apple Developer enrollment](https://developer.apple.com/programs/enroll/). Choose individual or organization intentionally: Apple uses the corresponding legal identity as the seller. Apple lists membership at US$99 per year (local pricing and qualifying waivers may apply). Complete identity verification, the agreement and membership purchase yourself. Do not send passwords, verification codes or private signing keys in chat or commit them to GitHub.

After activation, provide the Team ID, seller name and a public support contact. Review and complete any App Store Connect agreements or regional trader declarations required for your distribution regions. Install full Xcode from Apple and sign into that team in Xcode Settings → Accounts.

## 2. Native clients and SDKs

| Platform | Xcode scheme | Minimum OS | Submission plan |
| --- | --- | --- | --- |
| iPhone / iPad | `Prism` | iOS/iPadOS 17 | One universal iOS build |
| Apple TV | `PrismTV` | tvOS 17 | Separate tvOS build |
| Mac | `PrismMac` | macOS 14 | Native sandboxed macOS build |
| iPhone Duo | `Prism` + `PRISM_DUO_SDK` | Duo APIs require iOS 27.1 | Validate with 27.1 beta; TestFlight first |

Bundle IDs in `ios/project.yml` are provisional until the team can register them: `media.prism.ios`, `media.prism.tvos`, `media.prism.macos`. Resolve App Store name availability and decide separate records versus a universal-purchase record before registration; linked platforms may require matching bundle IDs. Do not change identifiers after the first upload without checking Apple's rules.

The Apple client shares SwiftUI/AVKit code. It is separate from the existing Electron/libVLC desktop app. It currently offers direct playback, not the Electron edition's full codec support or music features. Apple Watch support is not included in these targets.

Apple's September 18, 2026 release notes permit Xcode 27.1 beta builds for internal/external TestFlight. Do not treat beta acceptance as App Store release acceptance. Recheck [App Store Connect release notes](https://developer.apple.com/help/app-store-connect/release-notes/) before the Duo release. The validation workflow explicitly selects 27.0 and 27.1 beta rather than relying on runner defaults.

## 3. Build and validate

From the repository root, after enrolling and confirming bundle IDs:

```sh
brew install xcodegen
# Replace the example Team ID with your own; increase the build number for each upload.
ios/scripts/archive.sh ios ABCDE12345 1
ios/scripts/archive.sh tvos ABCDE12345 1
ios/scripts/archive.sh macos ABCDE12345 1
```

These commands use the Xcode account for automatic provisioning and create archives under `ios/.build/archives`. They do not upload or submit. In Xcode Organizer, validate each archive and distribute to App Store Connect. Do not use unsigned CI artifacts as installers or upload them to the store. Keep all certificates, profiles, account tokens and private keys outside source control.

For Duo development, generate the project and build with the 27.1 SDK and `SWIFT_ACTIVE_COMPILATION_CONDITIONS=PRISM_DUO_SDK`. Confirm acceptance before archiving with those settings. Preserve the player while changing posture; physical divisions take precedence over manual layouts so controls avoid the fold.

## 4. Test the actual release build

- iPhone/iPad: independent fresh server, valid and invalid login, empty library, series episodes, refresh, sign-out, relaunch, direct playback, errors, seeking, subtitles/audio offered by the file, local-network permission denied/allowed, HTTPS and remote network failures.
- iPad: portrait, landscape, narrow and wide multitasking windows, large text and VoiceOver. Check controls do not overlap or clip.
- tvOS: every control reachable by focus, text entry, Play/Pause, Back, top-of-library navigation, long library, system player overlays and remote reconnection.
- macOS: native title-bar dragging during playback, button and green-control full screen, multiple independent windows, resize, sandboxed server access and keyboard navigation. Test Apple silicon and Intel where supported.
- Duo: open, closed outer display, horizontal and vertical division, rotation and repeated transitions while playing; eye toggle, browse/select next title, playback continuity and controls clear of divisions. Do not promise inactive-screen playback that the OS does not permit.
- Offline sample: play and seek without a network, exit sample and connect a real server; sample must never silently connect to a publisher server.
- TestFlight: install signed builds on actual devices. Record build numbers, device/OS and results. SDK compilation alone does not establish device support.

## 5. Store record and review

Use [STORE-LISTING.md](STORE-LISTING.md), publish and verify the [privacy policy](PRIVACY.md) at a stable public URL, and verify the support URL works when signed out. Fill the publisher's real copyright/contact details. Complete privacy, ratings, export-compliance and regional questions accurately; these are not auto-approved by the source code.

Capture genuine screenshots from the final builds using only original or licensed media. Provide a separate HTTPS review server with a read-only review account and lawful sample media so Apple can test authentication and streaming. The offline sample allows immediate exploration but does not replace server-flow testing.

Select the processed build for each platform, attach screenshots and review information, then Add for Review and Submit for Review. Apple treats iOS, tvOS and macOS submissions separately. Verify the actual submitted status and record the app ID, version, build and submission date. Only then describe PRISM as submitted.

## Evidence and remaining work

The GitHub Apple validation workflow builds the platform targets and runs core layout/address/time tests. See [native validation evidence](VALIDATION.md) for exact runs, the reproduced Mac crash and its fix, and the local smoke test. Signing, App Store validation, TestFlight installation, full physical-device QA, final screenshots, final privacy responses and review-server setup remain required before release.

Sources: [Apple enrollment](https://developer.apple.com/programs/enroll/), [App submission](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app), [iPhone Duo preparation](https://developer.apple.com/iphone-duo/), [Privacy management](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy).
