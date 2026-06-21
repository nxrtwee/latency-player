// Full AppDelegate copied over the Capacitor-generated one during the iOS build
// (see scripts/patch-ios.sh). Pinned to the Capacitor 8 template structure.
//
// Native pieces the web layer can't do:
//   1. AVAudioSession .playback  → audio keeps playing when locked/backgrounded.
//   2. Lock-screen transport: WKWebView turns on the ±10s skip commands for media
//      by default and re-asserts them whenever playback (re)starts, so the lock
//      screen shows skip buttons instead of prev/next-track. We take the track
//      buttons fully native: own targets for next/previous that drive the web
//      player through a JS bridge, and a light repeating re-assert that keeps the
//      skip commands disabled while the app is foregrounded (the state then
//      persists once the screen is locked).
import UIKit
import Capacitor
import AVFoundation
import MediaPlayer
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var commandTimer: Timer?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("AVAudioSession error: \(error)")
        }

        // Targets added once (adding again would multiply the calls).
        let cc = MPRemoteCommandCenter.shared()
        cc.nextTrackCommand.addTarget { [weak self] _ in self?.bridgeJS("__lpNext"); return .success }
        cc.previousTrackCommand.addTarget { [weak self] _ in self?.bridgeJS("__lpPrev"); return .success }

        forceTrackButtons()
        commandTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.forceTrackButtons()
        }
        return true
    }

    private func forceTrackButtons() {
        let cc = MPRemoteCommandCenter.shared()
        cc.skipForwardCommand.isEnabled = false
        cc.skipBackwardCommand.isEnabled = false
        cc.changePlaybackPositionCommand.isEnabled = false
        cc.nextTrackCommand.isEnabled = true
        cc.previousTrackCommand.isEnabled = true
    }

    // Call a global JS function exposed by the web player (window.__lpNext / __lpPrev).
    private func bridgeJS(_ fn: String) {
        DispatchQueue.main.async {
            let vc = self.window?.rootViewController as? CAPBridgeViewController
            vc?.bridge?.webView?.evaluateJavaScript("window.\(fn) && window.\(fn)()", completionHandler: nil)
        }
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        forceTrackButtons()
    }

    func applicationWillResignActive(_ application: UIApplication) {}

    func applicationDidEnterBackground(_ application: UIApplication) {}

    func applicationWillEnterForeground(_ application: UIApplication) {}

    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
