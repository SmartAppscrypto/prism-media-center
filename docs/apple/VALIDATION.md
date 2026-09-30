# Native Apple validation — September 29, 2026

This report concerns the native `ios/` targets, not the previously released Electron installers. No App Store submission, distribution signing or TestFlight installation has occurred.

## SDK validation

[GitHub run 36648732565](https://github.com/SmartAppscrypto/prism-media-center/actions/runs/36648732565) passed at `33f5955`:

| Check | Result |
| --- | --- |
| iPhone/iPad Release simulator build, Xcode 27.0 | Pass |
| Duo Release simulator build, Xcode 27.1 beta with `PRISM_DUO_SDK` | Pass |
| Apple TV Release simulator build, Xcode 27.0 | Pass |
| Native macOS Release build, Xcode 27.0 | Pass |
| Core unit tests | 7 passed, 0 failed |

Tests cover horizontal/vertical division avoidance, full-screen selection around a physical division, open/closed single-pane fallback, narrow windows, credential/query-bearing server address rejection, reverse-proxy paths, query encoding, identifier path rejection and finite/precise remaining time.

Earlier build failures exposed the unescaped Swift `Type` property, unsupported tvOS `DisclosureGroup` and 1254-pixel source images mislabeled as 1024-pixel icons. These were corrected. The runner contains 27.1 beta but defaults to 27.0; explicitly selecting the correct Xcode resolved the prior Duo SDK blocker.

## Local native Mac smoke test

Tested the `f16d2cc` CI app on this Apple silicon Mac with a local ad-hoc signature and the same outgoing-network sandbox entitlement. This is not distribution-signing validation.

- Clean launch shows no preconfigured server or account.
- Bundled offline sample opens, plays and exposes native pause/seek controls and the remaining-time counter.
- Pause changes the player state; the dedicated fullscreen button enters and exits full screen.
- Return-to-library, PRISM navigation and exit-sample work.
- Connecting to the loopback-only fixture in `ios/scripts/smoke-server.py` with disposable credentials succeeds. The native client decodes camelCase login/library responses and streams the original MP4 with token authentication.
- Opening a second native window displays independent, empty server setup.
- Setup/privacy sheet opens and includes usable support and guide links.
- Test application closed and fixture stopped after validation.

The first Mac test crashed in Apple's `_AVKit_SwiftUI` bridge on entering playback. Replacing the Mac bridge with `AVPlayerView` resolved the reproduced crash, while preserving the model's player during layout changes. The latest small UI cleanup removes the empty top row, expands row hit targets and explicitly disables player URL sharing; see its separate CI run on the PR.

## Remaining release gates

- Apple Developer enrollment, identifier registration, provisioning and signed archive validation.
- Real Jellyfin server integration on the native clients; the loopback fixture validates protocol handling, not the full independent server deployment.
- Physical iPhone/iPad/tvOS/Duo QA, simulator posture interaction and lower supported OS checks. SDK builds alone do not establish those behaviors.
- Mac title-bar movement acceptance with a physical mouse/trackpad, Intel runtime validation, full keyboard/VoiceOver review and all network/error cases.
- TestFlight install, final real screenshots, final privacy/rating/compliance answers and isolated review-server availability.
- Duo release-SDK acceptance: currently verified for 27.1 beta TestFlight only.

See [the release checklist](APP-STORE-CHECKLIST.md). Do not describe the app as store-ready or submitted until these gates are completed.
