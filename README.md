# PRISM Media Center

PRISM is a cinematic desktop client and self-hosted media-server project for media stored on your own NAS. The current server uses the Jellyfin backend and API while PRISM supplies its own desktop experience, deployment configuration, and branding.

## Project architecture

This repository contains the PRISM desktop client and Synology deployment documentation. The branded server web interface is maintained in `SmartAppscrypto/prism-web`, based on the GPL-2.0-licensed Jellyfin Web project. The custom container build is maintained in `SmartAppscrypto/prism-server` and combines that interface with the upstream Jellyfin backend.

## 1. Run the server on Synology

Follow the complete [Synology installation guide](docs/SYNOLOGY.md). It covers Container Manager, media permissions, Jellyfin's setup wizard, optional hardware acceleration, updates, backups, and troubleshooting.

## 2. Run the PRISM client on this Mac

```bash
npm install
npm run dev
```

Choose **Explore the demo** to see the interaction without a server. To use your library, enter the Jellyfin address and account credentials. Prism stores the resulting Jellyfin session token locally in the Electron profile; it does not store the password.

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
