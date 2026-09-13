import SwiftUI

struct SettingsView: View {
    @Environment(AuthSession.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @AppStorage(Appearance.storageKey) private var appearance: Appearance = .system
    @State private var signingOut = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    HStack(spacing: 14) {
                        AvatarView(user: auth.user, size: 44)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(auth.user?.name ?? "")
                                .font(.headline)
                            Text(auth.user?.email ?? "")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                    Button("Sign out", role: .destructive) {
                        signingOut = true
                        Task {
                            await auth.signOut()
                            dismiss()
                        }
                    }
                    .disabled(signingOut)
                }

                Section("Appearance") {
                    Picker("Theme", selection: $appearance) {
                        ForEach(Appearance.allCases) { option in
                            Text(option.label).tag(option)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Section {
                    LabeledContent("Server", value: auth.origin.host() ?? auth.origin.absoluteString)
                } footer: {
                    Text("Sign out to switch servers.")
                }

                Section("About") {
                    LabeledContent("Version", value: "\(Bundle.main.shortVersion) (\(Bundle.main.buildNumber))")
                    Button("Open Folio on the web") {
                        openURL(auth.origin)
                    }
                    Link("Source on GitHub", destination: URL(string: "https://github.com/gillesmag/folio")!)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.large])
    }
}
