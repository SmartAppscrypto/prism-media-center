PRISM desktop preview for your own Jellyfin server. No developer account, NAS address or shared credentials are required.

## Downloads
- Apple Silicon Mac: `Prism-0.15.0-arm64.dmg`
- Intel Mac: `Prism-0.15.0-x64.dmg`
- Windows Intel/AMD 64-bit: `Prism-0.15.0-x64-Setup.exe`
- New server: `Prism-Server-Starter.zip`
- Start with `PRISM-Getting-Started.pdf`; compare downloads against `SHA256SUMS.txt`.

Includes gallery top navigation, random-sort Refresh, playback window dragging, remaining-time counter and a dedicated fullscreen button on both desktop platforms. Security changes validate privileged IPC callers, restrict navigation, encrypt desktop sessions, and limit artwork writes to administrators within the configured folder. Sign in again after upgrading.

These preview installers are unsigned and the Mac build is not notarized. Operating systems may show publisher warnings. Automated builds do not replace physical-device playback testing. The server starter requires Docker Desktop and an initial download; it uses upstream Jellyfin's setup screen. The default bind address is local-only.

Native iOS/iPhone Duo work is not a shipping feature of these desktop installers. Apple Watch and Apple TV apps are not included.

VLC 3.0.24 is embedded. Corresponding VLC source and third-party notices are included among the release assets.
