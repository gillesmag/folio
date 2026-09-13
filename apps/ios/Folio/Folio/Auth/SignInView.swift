import SwiftUI

struct SignInView: View {
    @Environment(AuthSession.self) private var auth
    @State private var editingServer = false
    @State private var serverText = ""
    @State private var showTokenEntry = false
    @State private var tokenText = ""

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(spacing: 8) {
                Text("Folio")
                    .font(.system(size: 44, weight: .bold, design: .default))
                    .tracking(-1.5)
                Text("Documents your agents push to you.")
                    .foregroundStyle(.secondary)
            }
            .padding(.bottom, 40)

            VStack(spacing: 12) {
                Button {
                    Task { await auth.signInWithGoogle() }
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "g.circle.fill")
                        Text("Continue with Google")
                    }
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                }
                .buttonStyle(.glassProminent)
                .disabled(auth.isSigningIn)

                if let error = auth.error {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .transition(.opacity)
                }
            }
            .padding(.horizontal, 32)
            .frame(maxWidth: 420)

            Spacer()

            VStack(spacing: 10) {
                if editingServer {
                    HStack {
                        TextField("https://folio.example.com", text: $serverText)
                            .textContentType(.URL)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .onSubmit(commitServer)
                        Button("Done", action: commitServer)
                            .buttonStyle(.glass)
                    }
                    .padding(.horizontal, 24)
                    .frame(maxWidth: 420)
                } else {
                    HStack(spacing: 6) {
                        Text(auth.origin.host() ?? auth.origin.absoluteString)
                        Text("·")
                        Button("Change") {
                            serverText = auth.origin.absoluteString
                            editingServer = true
                        }
                    }
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                }

                #if DEBUG
                Button(showTokenEntry ? "Hide token entry" : "Use a session token") {
                    withAnimation { showTokenEntry.toggle() }
                }
                .font(.footnote)
                .foregroundStyle(.tertiary)
                if showTokenEntry {
                    HStack {
                        SecureField("Session token from `folio login`", text: $tokenText)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        Button("Sign in") {
                            Task { await auth.signIn(token: tokenText) }
                        }
                        .buttonStyle(.glass)
                        .disabled(tokenText.isEmpty)
                    }
                    .padding(.horizontal, 24)
                    .frame(maxWidth: 420)
                }
                #endif
            }
            .padding(.bottom, 24)
        }
        .animation(.default, value: auth.error)
        .animation(.default, value: editingServer)
    }

    private func commitServer() {
        var text = serverText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.contains("://") { text = "https://" + text }
        if let url = URL(string: text), url.host() != nil {
            auth.setOrigin(url)
        }
        editingServer = false
    }
}

#Preview {
    SignInView().environment(AuthSession())
}
