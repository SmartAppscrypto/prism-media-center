# Install the Prism server on Synology

PRISM Server uses the Jellyfin backend with the PRISM web interface. These instructions target DSM 7 and Synology Container Manager.

## Before you begin

Your Synology model must support **Container Manager**. In DSM, open **Package Center**, search for **Container Manager**, and install it. If it is not offered for your model, this container-based installation is not supported by that NAS.

You will also need:

- the NAS's local IP address, such as `192.168.1.10`;
- a shared folder containing your movies;
- optionally, a separate shared folder containing TV shows.

This NAS currently uses the following shared folder:

```text
/volume1/Media
```

Change them to match your actual shared-folder paths.

## Step 1: Prepare the project folder

1. Open **File Station**.
2. Inside your `docker` shared folder, create a folder named `prism`.
3. Inside `prism`, create empty folders named `config` and `cache`.
4. From this repository, upload these two files into the `prism` folder:
   - `server/docker-compose.yml`
   - `server/.env.example`
5. Rename `.env.example` to `.env`. If File Station hides dotfiles, edit the Compose values directly during project creation instead.
6. Edit `.env` and replace the sample NAS address and media paths with your own.

The resulting NAS folder should look like this:

```text
/volume1/docker/prism/
├── .env
├── docker-compose.yml
├── cache/
└── config/
```

## Step 2: Give Jellyfin access to the media

In **Control Panel → Shared Folder**, select each media shared folder and choose **Edit → Permissions**. Ensure the account administering Container Manager can read the folder. The Compose file mounts media read-only, so Prism/Jellyfin cannot delete or rename the original files.

If the project log later reports `permission denied`, temporarily grant read access to the media shared folder's local users group, confirm the scan works, and then tighten permissions for your NAS configuration.

## Step 3: Create the Container Manager project

1. Open **Container Manager → Project**.
2. Click **Create**.
3. Set the project name to `prism`.
4. Set the path to `/volume1/docker/prism` (or the folder you created).
5. Choose the existing `docker-compose.yml` as the source. Depending on DSM, this is shown as **Use existing docker-compose.yml** or **Upload docker-compose.yml**.
6. Do not enable a Web Station portal; Jellyfin exposes its own port.
7. Review the YAML preview and click **Done**.
8. Choose to build and start the project.

Container Manager will download `ghcr.io/smartappscrypto/prism-server:latest`. When the project status becomes **Running**, open:

```text
http://YOUR-NAS-IP:8096
```

For example: `http://192.168.1.10:8096`.

## Step 4: Complete Jellyfin's setup wizard

1. Choose a language and create the administrator account. Use a password.
2. Add a **Movies** library and select the applicable folders under `/media`, such as `/media/1080P`, `/media/4K`, `/media/OpenMatte`, and `/media/Kids`.
3. Add a **Shows** library using `/media/Shows`, and optionally a separate kids library using `/media/Kids Shows`.
4. Choose the metadata language and country.
5. Keep remote access disabled while testing only on your home network.
6. Finish the wizard and sign in once through the Jellyfin web interface.

You can now open Prism on the Mac and enter `http://YOUR-NAS-IP:8096` with the Jellyfin username and password.

## Optional: hardware-accelerated transcoding

First make sure basic playback works. Then enable SSH temporarily in **Control Panel → Terminal & SNMP**, connect to the NAS, and run:

```bash
ls -l /dev/dri
```

If `renderD128` exists, edit `docker-compose.yml` and uncomment:

```yaml
devices:
  - /dev/dri:/dev/dri
```

Redeploy the project. In Jellyfin, open **Dashboard → Playback → Transcoding** and try **Intel Quick Sync (QSV)** on a supported Intel NAS, or **VA-API** when appropriate. Do not enable codecs the hardware does not support. Play a video that needs transcoding and inspect the Jellyfin playback information to verify hardware transcoding is active.

Disable SSH again when finished.

## Updating and backing up

- Back up `/volume1/docker/prism/config`; it contains the Jellyfin database and settings.
- The media itself is outside the container and is mounted read-only.
- To update, choose **Build** or **Update** so Container Manager pulls the current PRISM Server image and recreates the container.
- Back up `config` before an upgrade. Pin the PRISM Server image to a digest instead of `latest` if you prefer controlled upgrades.

## Troubleshooting

- **The project stops immediately:** remove or keep the `/dev/dri` mapping commented out, then inspect **Project → prism → Logs**.
- **Prism cannot connect:** confirm the Mac and NAS are on the same network and that `http://NAS-IP:8096` opens in Safari.
- **The library is empty:** verify `MEDIA_PATH` is a real DSM path and that the appropriate folders below `/media` were selected inside Jellyfin.
- **Permission denied:** review Synology shared-folder permissions and the container log.
- **Remote streaming:** use a private VPN or an HTTPS reverse proxy. Do not forward unencrypted port 8096 directly to the internet.
