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
        .package(url: "https://github.com/stasel/WebRTC.git", .upToNextMajor(from: "151.0.0")),
        .package(url: "https://github.com/firebase/firebase-ios-sdk.git", .upToNextMajor(from: "12.7.0"))
    ],
    targets: [
        .target(
            name: "NativeWebRTCPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "WebRTC", package: "WebRTC"),
                .product(name: "FirebaseFirestore", package: "firebase-ios-sdk"),
                .product(name: "FirebaseAuth", package: "firebase-ios-sdk")
            ],
            path: "ios/Sources/NativeWebRTCPlugin")
    ]
)
