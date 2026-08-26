/*
 * Copyright 2026 LiveKit
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import LiveKit
import Logging
import SwiftUI

struct ContentView: View {
    @ObservedObject var callManager = CallManager.shared
    @ObservedObject var room: Room = CallManager.shared.room

    // Hardcoded defaults for our fixed "calltest" room / tester1 identity —
    // this device is always the iOS side, so there's no reason to make the
    // tester paste these in by hand every time.
    @AppStorage("url") var url: String = "wss://20-16-170-193.sslip.io"
    @AppStorage("token") var token: String = "eyJhbGciOiJIUzI1NiJ9.eyJ2aWRlbyI6eyJyb29tSm9pbiI6dHJ1ZSwicm9vbSI6ImNhbGx0ZXN0IiwiY2FuUHVibGlzaCI6dHJ1ZSwiY2FuU3Vic2NyaWJlIjp0cnVlfSwiaXNzIjoiQVBJa2V5LWJyYXZlLWZyb2ciLCJleHAiOjE3OTAzNzM0MDgsIm5iZiI6MTc4Nzc4MTQwOCwic3ViIjoidGVzdGVyMSJ9.EDLWZZdwTpHzr7CHz3RARyzLEddvgisFBIssUynZE88"

    @State var showTokenCopiedToast: Bool = false

    var body: some View {
        VStack(spacing: 10) {
            Text("CallKit Example")
                .font(.title)
                .fontWeight(.bold)

            Form {
                Section("States") {
                    HStack {
                        HStack(spacing: 8) {
                            Image(systemName: roomStateIcon(for: room.connectionState))
                                .foregroundColor(roomStateColor(for: room.connectionState))
                            Text("Room state")
                                .fontWeight(.medium)
                        }
                        Spacer()
                        Text(String(describing: room.connectionState))
                            .foregroundColor(.secondary)
                            .font(.caption)
                    }

                    HStack {
                        HStack(spacing: 8) {
                            Image(systemName: callStateIcon(for: callManager.callState))
                                .foregroundColor(callStateColor(for: callManager.callState))
                            Text("Call state")
                                .fontWeight(.medium)
                        }
                        Spacer()
                        Text(String(describing: callManager.callState))
                            .foregroundColor(.secondary)
                            .font(.caption)
                    }

                    HStack {
                        HStack(spacing: 8) {
                            Image(systemName: "phone.circle")
                                .foregroundColor(.blue)
                            Text("Call ID")
                                .fontWeight(.medium)
                        }
                        Spacer()
                        Text((callManager.activeCallUUID != nil) ? callManager.activeCallUUID!.uuidString : "Not in a call")
                            .foregroundColor(.secondary)
                            .font(.caption)
                            .monospaced()
                    }
                }

                Section("1. Room for testing") {
                    TextField("URL", text: $url)
                        .autocapitalization(.none)
                        .autocorrectionDisabled(true)
                        .keyboardType(.URL)
                        .disabled(room.connectionState != .disconnected)

                    SecureField("Token", text: $token)
                        .autocapitalization(.none)
                        .autocorrectionDisabled(true)
                        .keyboardType(.asciiCapable)
                        .disabled(room.connectionState != .disconnected)
                }

                Section("3. VoIP Push Token") {
                    if let token = callManager.voipToken {
                        Button(action: {
                            UIPasteboard.general.string = token
                            showTokenCopiedToast = true
                        }) {
                            HStack {
                                Text(token)
                                    .font(.caption)
                                    .monospaced()
                                    .foregroundColor(.primary)
                                    .multilineTextAlignment(.leading)
                                Spacer()
                                Image(systemName: "doc.on.clipboard")
                                    .foregroundColor(.blue)
                            }
                        }
                        .buttonStyle(.plain)
                    } else {
                        Text("No VoIP token available")
                            .foregroundColor(.gray)
                    }
                }

                Section("4. Call") {
                    if callManager.hasActiveCall {
                        Button("End call") {
                            Task {
                                // "Start call" below connects directly (no CallKit call
                                // was ever registered), so tear it down the same way.
                                await callManager.endCallDirect()
                            }
                        }
                    } else {
                        // Our real app's caller never uses CXStartCallAction (that
                        // requires an Apple entitlement we don't have/need) — this
                        // connects straight to the room, same as production.
                        Button("Start call") {
                            Task {
                                await callManager.startCallDirect()
                            }
                        }
                        Button("Simulate incoming call") {
                            Task {
                                try await callManager.reportIncomingCallAsync(from: "user2", callerName: "Tommie Sunshine")
                            }
                        }
                    }
                }
            }
        }
        .padding()
        .overlay(
            Group {
                if showTokenCopiedToast {
                    VStack {
                        Spacer()
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text("Token copied to clipboard")
                                .foregroundColor(.primary)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color(.systemBackground))
                        .cornerRadius(8)
                        .shadow(radius: 4)
                        .padding(.bottom, 50)
                    }
                    .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.3), value: showTokenCopiedToast)
        )
        .onChange(of: showTokenCopiedToast) { _, newValue in
            if newValue {
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                    showTokenCopiedToast = false
                }
            }
        }
    }

    private func roomStateIcon(for state: ConnectionState) -> String {
        switch state {
        case .disconnected:
            return "network.slash"
        case .connecting:
            return "bolt"
        case .connected:
            return "network"
        case .reconnecting:
            return "arrow.triangle.2.circlepath"
        case .disconnecting:
            return "arrow.down.circle"
        @unknown default:
            return "questionmark.circle"
        }
    }

    private func roomStateColor(for state: ConnectionState) -> Color {
        switch state {
        case .disconnected:
            return .red
        case .connecting:
            return .orange
        case .connected:
            return .green
        case .reconnecting:
            return .blue
        case .disconnecting:
            return .orange
        @unknown default:
            return .gray
        }
    }

    private func callStateIcon(for state: CallState) -> String {
        switch state {
        case .idle:
            "phone"
        case .errored:
            "phone.badge.exclamationmark"
        case .activeIncoming:
            "phone.arrow.down.left"
        case .activeOutgoing:
            "phone.arrow.up.right"
        case .connected:
            "phone.connection"
        }
    }

    private func callStateColor(for state: CallState) -> Color {
        switch state {
        case .idle:
            .gray
        case .errored:
            .red
        case .activeIncoming:
            .blue
        case .activeOutgoing:
            .orange
        case .connected:
            .green
        }
    }
}
