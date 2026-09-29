# PRISM Media Center

**[Download Mac / Windows installers](https://github.com/SmartAppscrypto/prism-media-center/releases)** · **[Beginner setup guide](docs/GETTING-STARTED.md)** · **[Printable guide](output/pdf/PRISM-Getting-Started.pdf)**

PRISM runs against **your own** server, media folders and accounts. The starter uses the official Jellyfin container and has no dependency on the author's NAS. Downloads are unsigned desktop previews; see the guide before installing.


PRISM is a cinematic desktop client and self-hosted media-server project for media stored on your own NAS. The current server uses the Jellyfin backend and API while PRISM supplies its own desktop experience, deployment configuration, and branding.

## Project architecture

This repository contains the PRISM desktop client and Synology deployment documentation. An optional branded server web interface is maintained in `SmartAppscrypto/prism-web`, based on the GPL-2.0-licensed Jellyfin Web project. The custom container build is maintained in `SmartAppscrypto/prism-server` and combines that interface with the upstream Jellyfin backend.

## 1. Run the server on Synology

Follow the complete [Synology installation guide](docs/SYNOLOGY.md). It covers Container Manager, media permissions, Jellyfin's setup wizard, optional hardware acceleration, updates, backups, and troubleshooting.

## 2. Run the PRISM client on this Mac

```bash
npm install
npm run dev
```

Choose **Explore the demo** to see the interaction without a server. To use your library, enter the Jellyfin address and account credentials. Prism encrypts the desktop Jellyfin session with the operating system secure-storage facility; it does not store the password.

To build an installable macOS disk image:

```bash
npm run package:mac
```

Open the DMG in `desktop/release/`, drag PRISM into Applications, and launch it. This local development build is unsigned; if macOS blocks the first launch, Control-click PRISM in Applications, choose **Open**, then confirm **Open**.

## 3. Build a Windows installer

Run this on Windows (or in a Windows CI runner):

```powershell
npm install
npm run package:windows
```

Install the 64-bit VLC desktop app before making a local build, or set `PRISM_VLC_DIR` to an extracted official VLC directory. VLC is used as an embedded decoding runtime during packaging; end users do not see a separate VLC window and do not need to install VLC themselves. The self-contained NSIS installer is written to `desktop/release/`.

The Windows workflow also produces a downloadable installer artifact on GitHub. The native Windows player decodes formats such as HEVC, E-AC-3, and TrueHD on the PC while preserving the original server stream, so the NAS does not transcode those titles.

## Current slice

- Synology-friendly Jellyfin Compose deployment
- Jellyfin username/password authentication
- Movie and series library loading
- Real primary and backdrop artwork
- Prism poster wall and animated inspect/reshelve flow
- Direct-play video in the desktop client
- Demo library for UI work without a server
- Embedded VLC playback on macOS and Windows

Direct play is the first playback path. PRISM intentionally asks the server to preserve original streams and uses its embedded desktop decoder for formats that Chromium cannot play natively.

## Gallery and playback controls

Click **PRISM** or **↑ TOP** to close title details and return to the top of the current gallery. Keyboard and directional remotes can press **Home**, or press **Up** from the first poster row to focus **↑ TOP**, then select it. **Down** from that control returns focus to the first poster. These are desktop directional controls; this repository does not yet ship a native Apple TV app.

Choose **Random** sorting to reveal **↻ REFRESH**, which reshuffles the current gallery. During video playback, the timer beside the scrubber shows remaining time. Drag the empty top area to the right of the Back button to move the desktop window while playback continues.
