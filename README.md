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

The NSIS installer is written to `desktop/release/`.

## Current slice

- Synology-friendly Jellyfin Compose deployment
- Jellyfin username/password authentication
- Movie and series library loading
- Real primary and backdrop artwork
- Prism poster wall and animated inspect/reshelve flow
- Direct-play video in the desktop client
- Demo library for UI work without a server
- Windows packaging configuration

Direct play is the first playback path. Series appear in the library, but season/episode navigation is the next UI milestone. Some codecs and containers will also require a Jellyfin transcoding/HLS playback negotiation pass.
