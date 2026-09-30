import SwiftUI

struct HelpView: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack {
            HStack { Text("PRISM Help & Privacy").font(.title2); Spacer(); Button("Done") { dismiss() } }.padding()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Your library, your server").font(.headline)
                    Text("Install your own Jellyfin server, create an account there, and add folders containing media you have permission to play. Connect PRISM using your server address, username and password. PRISM does not supply movies, subscriptions or a hosted media account.")
                    Text("Use HTTPS with a trusted certificate for remote access. For a home server, allow Local Network access when prompted and use the same network. A server bound only to localhost cannot be reached by another device. See the beginner guide for setup steps.")
                    Text("Playback").font(.headline)
                    Text("This Apple client directly plays Apple-compatible video such as MP4 with H.264/HEVC video and AAC audio. Automatic server transcoding, downloading and playback-history sync are not included. Reconnect after quitting; credentials are kept in memory only.")
                    Text("On Apple TV, use Play/Pause on the remote to control playback. Back returns to the library and focuses PRISM at the top. On Mac, use the fullscreen button or the green window control; the native title bar remains draggable when windowed.")
                    Text("Privacy").font(.headline)
                    Text("PRISM includes no advertising, tracking, analytics or crash-reporting SDK. Your account credentials and media requests go directly to the server you enter. That server receives your account identifier, a session device identifier and requested titles, and may keep access logs. PRISM's developer does not operate or receive those requests.")
                    Text("Passwords, session tokens and optional TMDb tokens are kept in memory and cleared on sign-out or app exit. Media streaming may use system buffers. PRISM does not create a separate cloud account or upload your library to its developer.")
                    Text("Optional financial details contact TMDb using the token you enter. TMDb receives your IP address, token and requested movie identifier under its own privacy policy. Leave that field empty to avoid these requests. The bundled sample works offline.")
                    Text("Support and privacy requests: open an issue in the public PRISM repository. Do not post passwords, access tokens, personal server addresses or private media. To remove server-side records or revoke a session, contact your own server administrator.")
                    #if !os(tvOS)
                    Link("Beginner setup guide", destination: URL(string: "https://github.com/SmartAppscrypto/prism-media-center/blob/main/docs/GETTING-STARTED.md")!)
                    Link("PRISM support", destination: URL(string: "https://github.com/SmartAppscrypto/prism-media-center/issues")!)
                    Link("TMDb privacy policy", destination: URL(string: "https://www.themoviedb.org/privacy-policy")!)
                    #else
                    Text("Guide and support: github.com/SmartAppscrypto/prism-media-center")
                    Text("TMDb privacy: themoviedb.org/privacy-policy")
                    #endif
                }.padding()
            }
        }
    }
}
