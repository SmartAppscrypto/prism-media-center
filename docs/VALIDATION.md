# Release validation - PRISM 0.15.0 preview

For subsequent source changes, see the [application audit](AUDIT-2026-09-29.md). The results below describe the previously published preview, not the audit branch or updated installers.

29 September 2026.

- TypeScript/Vite production build: passed.
- UI/API regression suite: 43 tests passed, including both legacy and Jellyfin 12 JSON, gallery navigation, random refresh, Mac/Windows fullscreen and remaining time.
- Security regression suite: 4 tests passed on desktop build runners.
- npm audit: zero reported vulnerabilities at review time.
- Installers: Apple Silicon DMG, Intel DMG and Windows x64 EXE built on their corresponding GitHub runners.
- Clean official Jellyfin 12.1 container: first-run setup, independent account creation, real PRISM sign-in, views and empty-library fetch passed in the Server integration workflow.
- Local Apple Silicon app: first-run form had no server/account prefilled; demo navigation worked. A locally generated H.264/AAC test pattern played through embedded VLC; pause, remaining time and fullscreen enter/exit worked and preserved position.
- Local DMG checksum structure: hdiutil verify passed.
- Five-page guide: rendered and visually inspected.
- History scan: common credential patterns checked across the 34 pre-existing commits; no matches. Pattern scanning is not a complete secret audit.

Hardware limitations: no physical Windows installation/playback test, no Intel Mac playback test, no iPhone Duo device/simulator test. iOS compilation is blocked because the available Xcode runner has SDK 27.0 rather than required 27.1. Local Swift syntax parsing is not a substitute for a native SDK build. Desktop signing/notarization is not configured; downloads are unsigned previews.

The source-only integration test was corrected after the installer builds to wait through Jellyfin's initialization responses. Production desktop/server sources are unchanged between those verified installer builds and the final release source tag.
