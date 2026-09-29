# Third-party software

PRISM embeds unmodified VLC 3.0.24 libraries and plugins from VideoLAN's official distributions. LibVLC is licensed under LGPL-2.1-or-later; VLC plugins include GPL-2.0-or-later components. License texts accompany this file. Copyright belongs to the VideoLAN authors and each component's contributors.

VLC corresponding source, build scripts, and dependency recipes: https://download.videolan.org/pub/videolan/vlc/3.0.24/vlc-3.0.24.tar.xz
Additional dependency sources: https://download.videolan.org/pub/contrib/
Official binary distributions: https://download.videolan.org/pub/videolan/vlc/3.0.24/

The release also includes the VLC source archive. The runtime is dynamically loaded from resources/vlc and may be replaced with a compatible modified runtime. No PRISM restriction is intended to prohibit reverse engineering for debugging modifications to LGPL components.

Electron includes Chromium, Node.js and their licenses in the packaged application. JavaScript component licenses are in the source dependency packages and generated third-party notices. Jellyfin is separately downloaded and run by Docker under its upstream licenses; it is not embedded in the desktop installer.
