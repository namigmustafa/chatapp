import UIKit
import Capacitor

// Capacitor 8 registers plugins ONLY from capacitor.config.json's packageClassList
// (i.e. installed npm packages) plus built-ins — it no longer scans the Objective-C
// runtime, so the legacy CAP_PLUGIN macro in VoIPPlugin.m is never picked up. Our
// VoIPPlugin is a local app-target class, so it must be registered explicitly.
// Main.storyboard points its bridge view controller at this subclass.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(VoIPPlugin())
    }
}
