# PRISM on Synology - Grade 2: Intermediate

Start with [Getting Started](GETTING-STARTED.md) for the server/client distinction and account setup. Your NAS must offer **Container Manager** in DSM Package Center. Install it before proceeding.

1. Create a `prism` folder under your `docker` shared folder. Extract the Server Starter ZIP and copy its contents there, including Compose files and `.env.example`.
2. Rename `.env.example` to `.env`. Set `PRISM_BIND_ADDRESS` to **your NAS's LAN IPv4 address**. Set `MEDIA_PATH` to **your own** media shared-folder path (for example `/volume1/Media`). These are examples, not required folder names. Create `config` and `cache` folders inside the project folder.
3. In Container Manager > Project > Create, choose this folder and its `compose.yaml`. Review the file and start the project. The default image is the official `jellyfin/jellyfin:12.1`, not a developer-owned server.
4. Allow TCP 8096 from your home network in DSM Firewall. Open `http://YOUR-NAS-IP:8096` in a browser and create your own administrator and libraries. Inside the container, your media root is `/media`.
5. Create a non-administrator viewing account. Install PRISM on your PC or Mac and sign in using this NAS address and the new account. Keep the NAS running while watching.

Grant only the intended service account read access to the media folder. Do not broadly grant access to all NAS users to fix permission errors. Check container logs and the NAS's folder permissions instead. General media is mounted read-only.

The artwork writer is optional and disabled by default. See Grade 3 in the main guide before enabling its Compose profile. It needs an unprivileged UID/GID with access to the specific Home Videos folder and an administrator session. Expose 8097 only to trusted clients if using artwork. Never forward these unencrypted ports on your router.

Back up `config`, `.env` and media using your own snapshot/backup system. A running database backup may be inconsistent; stop the project for a filesystem copy. Before upgrading an existing Jellyfin installation to 12.1, follow [upstream migration requirements](https://github.com/jellyfin/jellyfin/releases). Do not replace an existing NAS configuration with the starter blindly.

Hardware transcoding is optional and hardware-specific. Once basic playback works, use Jellyfin's [hardware acceleration guide](https://jellyfin.org/docs/general/post-install/transcoding/hardware-acceleration/) to decide whether `/dev/dri` and QSV/VA-API apply. No SSH or device passthrough is needed for the basic installation.
