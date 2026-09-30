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

## 2026-09-30 — native TV playback and library foundation

- Replaced tvOS AVFoundation/HLS playback with the official stable VideoLAN TVVLCKit 3.7.3 engine and original Jellyfin media streams, following the desktop client's direct-source strategy. The other Apple targets retain AVFoundation.
- Server `/Users/{id}/Views` drives separate named sections, and `ParentId` plus collection-specific item types scopes each library exactly as in `desktop/src/jellyfin.ts`. Music albums open their audio tracks.
- Session tokens now survive app exit/replacement in the device Keychain; passwords are never persisted. Sign-out removes the stored session. A playback failure does not sign out.
- Full-screen TV video has auto-hiding transport controls with play/pause, ten-second seeking, runtime remaining and return to library. Removed the permanent toolbar and the view-disappearance playback-stop hook.
- Validation: 12 core tests passed on macOS. Two signed tvOS simulator integration tests passed, including nonzero decoded VLC video frames, pause/restart, and actual Keychain write/read/delete. Physical-device signed build and install succeeded.
- Physical Apple TV NAS playback, library focus navigation and session restoration after relaunch still require user verification. Launch was blocked by the sleeping TV; installation itself succeeded. Do not treat simulator success as confirmation that the NAS movie is fixed.
- This remains a native client under development, not full feature parity with Electron PRISM. Playback-history synchronization, downloads, music queues, editing artwork and the full desktop presentation remain release gaps. No App Store submission has been made.

### Physical-device launch packaging correction

The first VLC device install crashed before showing UI: dyld could not load `@rpath/TVVLCKit.framework/TVVLCKit`. The simulator test runner's framework search paths masked a missing framework in the app bundle. TVVLCKit is dynamic and must be embedded and signed, not only linked. The XcodeGen dependency now does both. The rebuilt physical-device bundle passed `codesign --verify --deep --strict`, contained the framework, and launched on the Apple TV without that dyld error. `verify-tv-bundle.sh` now gates the TV CI build against this omission. NAS playback remains a separate verification step.

### TV remote controls, missing pictures, and gallery update

The user confirmed most NAS movies and home videos play with VLC. Two home videos (America 250 and a Christmas video) still produced audio without a picture; their actual media metadata has not yet been captured, so their root cause and recovery are not confirmed.

- Replaced the disappearing player focus target and parent tap/move handlers with a persistent full-screen button and explicit transport focus. Select/directional input reveals controls; Play/Pause works at either level; Back first dismisses controls and then returns to the library. Seeking clamps the position and respects seekability.
- Added a bounded software-decoder retry when video is expected, playback advances, and VLC reports no displayed frames for ten seconds. It bypasses both VLC's native VideoToolbox decoder and avcodec hardware acceleration. A manual **Retry picture** action also handles cases where decoded frames are black. Retry keeps the approximate position and never clears the server session. Software decoding may be slower on demanding files.
- **Playback info** shows codec, profile, dimensions, bit depth, and decoded/displayed/lost frame counts, without stream URLs or credentials. Compare these on an affected and a working home video. This is instrumentation and a fallback, not proof that the two reported files are fixed.
- Added a dedicated TV poster gallery, search within the selected library, title/year/random sorting, refresh, focus outlines, and a side-by-side details screen with an explicit initial Play/episode focus. Poster fallback typography adapts to TV cards. The existing desktop remains the reference; the parity gaps listed above remain open.
- Local checks: signed TV simulator VLC tests pass for automatic/software decode, seeking, pause/restart, and Keychain persistence. An XCUIRemote test passes through sample-library navigation, details, opening controls, select-to-pause, hardware Play/Pause, right-to-skip, and two-stage Back navigation. Twelve core tests and iOS simulator/device TV builds pass. Embedded framework and deep signature checks pass; the updated app was installed and launched on the physical TV.
- Physical remote and the two NAS titles still require acceptance on the user's TV. Simulator input and the bundled H.264 sample cannot establish compatibility with every camera export.

The final simulator run logged all three test cases passing, but Xcode stalled after test teardown while finalizing its result bundle. The stalled build processes were stopped; there is no finalized xcresult archive for that run. The passing assertions are recorded in the local test log. The earlier gallery/details screenshot attachments were exported and inspected; initial review led to smaller poster fallback text and a corrected sub-minute runtime label.

### White playback overlay and physical-TV memory termination

The previous invisible full-screen transport used `PlainButtonStyle`, which still adds a tvOS focus highlight. A custom style with focus and hover effects disabled now leaves the video untouched. A new XCUIRemote regression compares the same paused video's brightness above the transport with controls visible and hidden. The complete TV simulator test command finished successfully; its exported screenshots were also inspected.

The physical TV's jetsam report identified PRISM as the foreground process killed for `per-process-limit`. Server metadata for the reported home movie showed 5952×3968 HEVC Main 10, beyond the Apple TV 4K's documented 2160p formats. The forced software-decoding retry is removed, including its automatic invocation. Original videos above 3840×2160 now negotiate a bounded server-converted H.264/AAC stream (up to 1920×1080, 8-bit, 8 Mbps) before opening a local decoder. Other video retains original-stream playback; the transport also offers explicit server conversion. A missing picture pauses playback and presents guidance instead of repeatedly allocating software decoders. Conversion failures preserve sign-in and report server errors.

A debug-only, opt-in media diagnosis launch argument uses the existing saved session to export a small local cache report containing title/format descriptions. It never exports tokens, server addresses or source paths. An optional exact-title playback probe exercises the normal playback path for up to 90 seconds, records frame counters and stops. Neither diagnostic entry point is compiled into Release builds.

Validation: 15 core tests pass, including resolution boundaries and server-conversion constraints; the TV playback/Keychain tests and remote/picture comparison test pass. Signed physical-TV build, framework packaging, deep code signature verification and iOS simulator build pass. Server conversion still depends on the connected Jellyfin server's permissions, FFmpeg configuration and performance; it is not an offline replacement for the original camera file.

Follow-up on the real server found a second memory hazard: the advertised conversion URL returned an unbounded `video/quicktime` response, not an HLS playlist. The old preflight buffered it until tvOS killed the process. Metadata requests now cap bodies at 16 MiB, and playlist requests at 512 KiB, with early format rejection and explicit request cancellation. A URLProtocol integration test verifies valid JSON, oversized declared responses, and binary payload rejection. The TV test command now passes four tests, including the remote/pixel regression.

TV conversion still negotiates playback permission/source/session information, then explicitly requests Jellyfin's documented `/Videos/{id}/master.m3u8` endpoint with H.264/AAC, width/height/bitrate bounds and both stream-copy options disabled. On the physical TV, both reported 5952×3968 home videos supplied valid master/media playlists and played beyond five seconds: one reported 310 decoded / 151 displayed / 0 lost frames; the other 310 / 149 / 0. These are startup and frame-delivery checks, not full-duration playback or a visual assessment of the home videos. The user chose to export 4K viewing copies; PRISM was returned to a normal launch with no diagnostic arguments. No source media or NAS settings were modified.
