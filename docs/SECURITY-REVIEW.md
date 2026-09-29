# PRISM security review - 29 September 2026

Scope: desktop renderer/preload/main-process code, optional artwork service, server defaults, npm dependency audit and release configuration. This is a focused engineering review, not an independent penetration test or a guarantee that no vulnerabilities remain.

| Finding | Severity | Resolution |
| --- | --- | --- |
| Privileged IPC accepted unvalidated renderer frames | High | Shared main-frame and exact app-page checks wrap every registered PRISM IPC handler. |
| Main window could navigate to untrusted content while retaining preload access | High | Block unexpected navigation/redirects, webview attachment and permission requests; restrict development origins to loopback. |
| Any authenticated viewer could write home-video artwork | High | Require administrator policy before accepting the upload body. |
| Artwork directory symlinks could escape the mount's intended subdirectory | High | Reject linked directory components, check canonical containment, reject non-regular targets and run writer unprivileged. |
| Desktop session persisted in plaintext localStorage | Medium | OS-encrypted storage in main process; old plaintext sessions removed; memory-only fallback if encryption unavailable. |
| Server template contained author's LAN address | Configuration/privacy | Removed personal addresses; official upstream image, relative folders, fresh user-created accounts and loopback binding. |
| Eight npm audit findings in build/test dependencies | Mixed | Updated lockfile; npm audit reports zero on this review date. |
| Authenticated API fetch could follow redirects | Medium | Core desktop API rejects redirects; server URL validation rejects credentials and non-HTTP schemes. |

Regression tests cover trusted/untrusted IPC pages, subframes, local-development origin matching, unauthorized artwork uploads, foreign origins, administrator enforcement and symlink escapes. Standard UI tests and production build are also run. Release CI reruns tests and dependency audit independently on each desktop OS. No known exploitable issue is intentionally accepted as fixed without a code change.

## Limits and remaining risks

- The renderer still needs session credentials in memory and media URLs include tokens for playback/artwork. Encrypted storage does not defend against a compromised logged-in OS account or a renderer exploit. Browser-only development mode uses localStorage and is not the distributed desktop app.
- Plain HTTP on a LAN is unencrypted. Use HTTPS/VPN for untrusted networks. Default server binding is localhost; users must deliberately enable LAN access.
- Filesystem containment checks are not atomic against a local attacker racing directory changes. Do not grant untrusted local users write access to mounted directories. The artwork service is optional, disabled by default and no longer runs as root.
- This review does not audit Jellyfin, VLC, Electron internals, native decoding of hostile media, every transitive license, or upstream service security. Keep dependencies and server patches current. Automated npm audit covers its advisory database only.
- Desktop installers are unsigned previews. macOS notarization and Windows publisher signing need the owner's signing credentials and separate release validation. Never disable OS-wide protections to install them.
- Native iOS/Duo source is development work, not part of the desktop release. SDK build, device testing, App Store signing, playback-format coverage and secure persistence must be completed before a mobile release.

Reference: [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security).
