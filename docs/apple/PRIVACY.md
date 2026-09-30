# PRISM Apple client privacy policy

Prepared September 29, 2026 for the native iOS, iPadOS, tvOS and macOS client. This policy describes the Apple client in `ios/`; the separate Electron desktop edition may store different local settings.

PRISM connects to a media server you choose. It does not provide a hosted movie library or a PRISM cloud account. The native client includes no advertising, tracking, analytics or crash-reporting SDK, and does not send library data to a PRISM-operated service.

## Your server

Signing in sends your username and password directly to your server. Subsequent library, detail and playback requests send the session credential and media identifiers to that server. Authentication also identifies the PRISM client and a random session device identifier. The server administrator controls its logs and retention. Use your own server or one whose administrator you trust. Use HTTPS for remote connections.

The app keeps passwords and optional TMDb tokens in memory only. It saves the server address, username, user identifier and revocable session token in the device Keychain so reconnecting does not require another login. Sign-out removes this saved session; quitting does not. No session is synchronized to a PRISM cloud service. Apple TV playback uses VideoLAN TVVLCKit; other Apple targets use Apple’s media system. Both may buffer media temporarily. The bundled sample plays without a network connection.

## Optional movie details

If you enter your own TMDb token and request financial details, the app sends that token and the requested movie identifier directly to TMDb. TMDb also receives ordinary connection information such as your IP address. These requests do not include your media-server password or session token. See [TMDb's privacy policy](https://www.themoviedb.org/privacy-policy). Leave the TMDb field empty to disable this feature.

## Choices and deletion

Sign out to remove the saved Keychain session and clear in-memory credentials. For deletion of server-side accounts, access logs or session credentials, use your server's account settings or contact its administrator. PRISM cannot delete records held by independent server operators or TMDb.

## Support and changes

Support and privacy questions can be raised through [PRISM's public issue tracker](https://github.com/SmartAppscrypto/prism-media-center/issues). Issues are public: do not include passwords, access tokens, private server addresses or personal media. See [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) for information submitted there.

This policy must be updated before a release changes these practices. The publisher must confirm its public contact details and final App Store privacy declarations before submission.
