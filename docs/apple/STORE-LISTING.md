# PRISM — App Store listing draft

**Status:** preparation only. No App Store Connect record or submission exists. Free download; no in-app purchases. Confirm name availability and final identifiers after Apple Developer enrollment. Use only claims verified in the final signed build.

| Field | Prepared value |
| --- | --- |
| Name | PRISM Media Player |
| Subtitle | Your server. Your cinema. |
| Primary category | Entertainment |
| Secondary category | Photo & Video |
| Version | 1.0.0 |
| Price | Free |
| In-app purchases / subscriptions | None |
| Keywords | jellyfin,media,movies,video,library,player,home,streaming |
| Support URL | https://github.com/SmartAppscrypto/prism-media-center/issues |
| Privacy URL | Publish `PRIVACY.md` at a stable public URL after merging; verify it loads without sign-in before entering it. |
| Copyright | Publisher's legal name required after enrollment; do not infer from the GitHub username. |

## Description

Make your own movie and television library feel at home on your Apple devices.

PRISM connects directly to your own Jellyfin server. Browse movies and shows, read title details, choose an episode, and watch Apple-compatible video with native playback controls and a remaining-time display.

Refresh the library to shuffle its order, or select PRISM to return to the top. On Mac, a dedicated fullscreen button works alongside the standard window controls. On Apple TV, control playback with your remote and press Back to return to the library.

Try the bundled offline sample before connecting a server. PRISM is free, with no advertisements or in-app purchases.

Requires your own Jellyfin server and media you have permission to play. Movies and streaming subscriptions are not included. The Apple client directly plays supported formats such as MP4 with H.264/HEVC video and AAC audio. Automatic transcoding, downloads, music-library features and playback-history sync are not included in this release. Your session stays in memory; sign in again after quitting.

## Duo release text — hold until release SDK and device testing pass

An adaptive player keeps playback above the fold with browsing or title details below. Hide the secondary pane with the eye button. The same player continues as the window changes size.

Do not include this paragraph or advertise complete Duo support for the Xcode 27.0 production build. `PRISM_DUO_SDK` activates the new geometry APIs only in the separate 27.1 build. Apple currently lists 27.1 beta acceptance for TestFlight, not App Store release.

## Review notes

PRISM is a client for user-operated Jellyfin servers. There is no publisher-hosted movie service, account creation, subscription, purchasing or third-party login.

To inspect playback without a server:

1. Launch PRISM and select **Try sample library**.
2. Select **PRISM Playback Sample**, then **Play**.
3. Pause, seek and inspect the remaining time. The original geometric sample is bundled and plays offline.
4. On Mac, toggle full screen and move the window by its title bar. On Apple TV, use Play/Pause and Back.
5. Choose **Library**, then **Exit sample** to return to server setup.
6. **Setup help & privacy** explains independent server setup and data handling.

For review of server authentication, browsing and streaming, supply a separate, continuously available HTTPS review server with an isolated read-only account and original/public-domain media. Keep its password only in App Store Connect review fields, never in the public repository. The offline sample does not validate those network features.

Review contact name, email and telephone must be supplied by the publisher. The current developer has not enrolled, so these fields and review-server credentials are intentionally unfilled.

## Privacy and ratings before submission

The native app has no analytics or advertising SDK and its privacy manifest declares no developer collection. Credentials, identifiers and content requests go to the user's server; optional TMDb requests go to TMDb. Review all current App Store privacy questions against `PRIVACY.md`, including any third-party collection, before selecting final answers. A privacy manifest does not replace App Store privacy responses.

Complete the age-rating questionnaire based on a personal media-library client and its actual content controls. Do not guess a rating or claim parental controls, unrestricted web browsing, caption coverage or other accessibility capabilities that have not been tested. Review third-party content rights, export-compliance questions and regional trader information with the actual publisher.

## Screenshot capture plan

Capture the actual final build on Apple's currently required iPhone, iPad, Mac and Apple TV sizes. Use the bundled sample or original media, never private library titles. Include setup, library, details, player and Mac full screen. Capture Duo layouts separately for TestFlight until eligible for release. Do not upload marketing mockups as proof of working device support. Screenshot and physical-device QA remain release gates.
