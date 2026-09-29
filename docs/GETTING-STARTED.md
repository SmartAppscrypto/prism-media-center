# PRISM | Your collection, your server

## Start here - Grade 1: Beginner

**You do not need a PRISM account, the developer's NAS, an API key, or a subscription.** You create your own account on your own server. PRISM is the player; Jellyfin is the server that indexes your files. The server computer must stay on while you watch. Use media you are entitled to access.

Allow about 30 minutes for setup, plus time to download and scan your collection. You need a Mac or Windows PC, an internet connection for installation, some video files, and room for Docker Desktop. Existing Jellyfin users can skip server installation and use their own server address.

### 1. Choose your downloads

Open [PRISM Releases](https://github.com/SmartAppscrypto/prism-media-center/releases) and expand **Assets** on the newest desktop preview.

| Your computer | Download |
| --- | --- |
| Mac with Apple M-series chip | `Prism-0.15.0-arm64.dmg` |
| Mac with Intel processor | `Prism-0.15.0-x64.dmg` |
| Windows PC with Intel/AMD 64-bit processor | `Prism-0.15.0-x64-Setup.exe` |
| Hosting a new server on either computer | Also get `Prism-Server-Starter.zip` |
| Printable instructions | `PRISM-Getting-Started.pdf` |

On Mac, Apple menu > About This Mac shows Chip or Processor. Native Windows ARM builds are not included. The current Electron-based client targets modern macOS and Windows 10/11; check Electron's current OS support before installing on older systems. Do not download the GitHub source ZIP unless you want to develop PRISM.

These are **unsigned preview builds**, not certified production installers. Apple/Windows may warn about an unidentified publisher. Verify the download came from the repository above. If you are not comfortable installing unsigned software, wait for a signed release. Never disable system-wide security protections. A checksum confirms file integrity, not publisher identity.

### 2. Create your own server

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) for your computer. Open it and wait until the engine is running. Accept its setup prompts; Windows may request WSL installation and a restart. Docker's own license terms apply.
2. Extract `Prism-Server-Starter.zip` into a permanent folder, such as Documents/PRISM. Do not run it from inside the ZIP or Downloads cleanup folders.
3. Open the extracted `server` folder. On Windows, double-click `Start-Server.bat`. On Mac, open `Start-Server.command`; if its execute permission was lost, open Terminal, type `sh `, drag the file into Terminal, and press Return.
4. Wait for the first container download. The script creates empty `media/Movies`, `media/Shows`, and `media/Home Videos` folders. Copy a small test movie into `media/Movies`.
5. Your browser opens `http://localhost:8096`. If not, type that address yourself. The setup page is Jellyfin-branded; this is expected.
6. Choose your language. Create an administrator name and a strong, unique password. **There is no shared/default PRISM login.** Keep that password somewhere safe.
7. Add a Movies library, selecting `/media/Movies` inside the server. Add Shows at `/media/Shows` if needed. Choose your metadata language and finish setup. Leave remote access and automatic port mapping disabled.
8. Wait until the test movie appears. Create a separate non-administrator viewing account under Dashboard > Users for everyday playback.

**Checkpoint:** The server website shows your test movie. No movie? Check the file is in `server/media/Movies` and the library points to `/media/Movies`. The first scan may take several minutes.

### 3. Install the player

**Mac:** Open the correct DMG, drag Prism to Applications, then open Prism. If macOS blocks this known download, review System Settings > Privacy & Security for its Open Anyway option. Do not remove quarantine from arbitrary files or disable Gatekeeper.

**Windows:** Run the Setup EXE and follow the installer. SmartScreen may warn because the preview is unsigned. Only proceed after checking the source and checksum; otherwise cancel and wait for a signed build.

In PRISM, enter `http://localhost:8096`, then the username and password you created on your server. Select a movie and press Play. VLC decoding libraries are included; viewers do not install VLC, Node.js, or developer tools. Passwords are not saved; the desktop session is encrypted with the OS secure-storage facility. After upgrading from an older plaintext-session build, sign in again.

**Checkpoint:** You can play, pause, seek and close your own movie. Your server and accounts are independent of the PRISM author's setup.

## Make it comfortable - Grade 2: Everyday use

- Click PRISM or TOP to return to the gallery's beginning. Home also works. Up from the first poster row focuses TOP.
- Choose Random, then REFRESH to reshuffle your library.
- Click FULL in the player, or press F, to toggle fullscreen. On Mac, the green window control is another option.
- Drag the empty top strip beside Back to move the window during playback. The timer to the right of the scrubber shows time remaining.
- Movies, shows, albums and home videos come from the libraries you created on your server.
- Budget and box-office data are optional: configure **your own** TMDb token in desktop settings. Missing data means unavailable, not zero. Metadata providers may receive title searches; artwork loads from your server and configured providers. PRISM does not connect to the author's NAS.

### Use a server on another computer or NAS

`localhost` always means the computer you are using. It does **not** mean your NAS. On the server computer, edit `.env` using a plain-text editor. Set `PRISM_BIND_ADDRESS` to that server's actual home-network IPv4 address, then run the start script again. Allow inbound TCP 8096 in its firewall only on your trusted private network. On the player computer, enter `http://YOUR-SERVER-LAN-IP:8096`. Both devices must be on the same trusted network. Do not use the literal placeholder.

To use an existing media folder, change `MEDIA_PATH` in `.env` to its full path. On Windows use forward slashes, for example `C:/Users/YourName/Videos`. Run the start script again and choose the matching folder below `/media` in Jellyfin. Do not rename or delete the server's `config` folder.

For Synology, follow [the NAS guide](SYNOLOGY.md). No developer-owned container registry is needed by the default setup.

## Keep it safe - Grade 3: Administrator

**Backups:** Stop the server with `docker compose down` from the server folder, then copy `config`, `.env`, and your media to a separate drive. `cache` can be rebuilt. Never use `down -v` as an uninstall shortcut. To restore, put the backup in the same folder before starting the same server version. Test backups before relying on them.

**Updates:** Back up first. Read upstream Jellyfin release notes before changing its pinned image version in Compose. Keep `compose.yaml` and `docker-compose.yml` identical. Run `docker compose pull` then `docker compose up -d jellyfin`. Install a newer PRISM client from Releases when available; it has no automatic updater. An older server may need staged database upgrades before 12.1; the starter is intended for a NEW server, not an automatic migration of an existing NAS.

**Outside home:** The starter intentionally does not open your router. Use a private VPN or a properly configured HTTPS reverse proxy. HTTP sends login/session traffic without encryption, so use it only on a trusted local network. Do not port-forward 8096 or 8097 directly to the internet.

**Artwork editing (optional):** The starter leaves the writer service disabled. Only enable it after setting `HOME_VIDEOS_PATH`, `JELLYFIN_HOME_VIDEOS_PATH`, and an unprivileged `ARTWORK_UID`/`ARTWORK_GID` with write access to that folder. Run `docker compose --profile artwork up -d --build`. Only a Jellyfin administrator may save artwork. The service rejects symbolic-link directories. Do not let untrusted local users alter mounted directory links while it runs. General movie files remain mounted read-only; back up home-video artwork and its history. Use the direct LAN address for this companion; reverse-proxy routing requires separate configuration.

### Verify a download

Compare your file hash with its entry in the release's `SHA256SUMS.txt`:

Mac Terminal: `shasum -a 256 ~/Downloads/Prism-0.15.0-arm64.dmg`

Windows PowerShell: `Get-FileHash "$HOME\Downloads\Prism-0.15.0-x64-Setup.exe" -Algorithm SHA256`

## Troubleshooting and readiness check

| Symptom | What to try |
| --- | --- |
| Start script says Docker is unavailable | Install/open Docker Desktop and wait for its engine. |
| Browser cannot open localhost:8096 | Run the starter again; check Docker Desktop's container logs. Another server may already use 8096. |
| Another computer cannot connect | Set the server's LAN bind address, restart, and check its private-network firewall rule. |
| Login fails | Test the SAME account in Jellyfin's web page. PRISM has no separate cloud account. |
| Empty library | Check the host folder, `/media` library path, file permissions and scan status. |
| Playback fails | Try a known-good MP4. Update the client and inspect server logs; not every media format is supported. |
| Artwork gets 403 | Use an administrator account and check the writable folder's UID/GID and symlinks. |
| Installer is blocked | Confirm its source and hash. It is unsigned; wait for a signed build if you cannot approve it safely. |

**Self-check: one point per completed item (5/5 = ready).** You can (1) open your server web page, (2) sign in with your own viewing account, (3) see your test movie, (4) play/pause/fullscreen from PRISM, and (5) identify where your `config` and media backups live. This is a setup checklist, not a security certification.

**Platform status:** Desktop preview for Mac and Windows. iPhone Duo work is separate native iOS source and is not included in these installers. Apple Watch and Apple TV apps are not included. Hardware/simulator validation and signing are required before any mobile release.

Official references: [Jellyfin containers](https://jellyfin.org/docs/general/installation/container/), [Docker Desktop](https://docs.docker.com/desktop/), [Jellyfin releases](https://github.com/jellyfin/jellyfin/releases).
