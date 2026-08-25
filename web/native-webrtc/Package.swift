// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ChatappNativeWebrtc",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "ChatappNativeWebrtc",
            targets: ["NativeWebRTCPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/livekit/client-sdk-swift.git", from: "2.0.0")
    ],
    targets: [
        .target(
            name: "NativeWebRTCPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "LiveKit", package: "client-sdk-swift")
            ],
            path: "ios/Sources/NativeWebRTCPlugin")
    ]
)
