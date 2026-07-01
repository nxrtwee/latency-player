// Full AppDelegate copied over the Capacitor-generated one during the iOS build
// (see scripts/patch-ios.sh). Pinned to the Capacitor 8 template structure.
//
// Native pieces:
//   1. AVAudioSession .playback → audio when locked/backgrounded.
//   2. NativeAudioBridge → WKScriptMessageHandler for lock-screen prev/next-track.
//      The bridge is installed on the WKWebView when it becomes available, giving
//      JS direct access to native AVPlayer and MPRemoteCommandCenter.
import UIKit
import Capacitor
import AVFoundation
import MediaPlayer

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var bridgeInstalled = false

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("AVAudioSession error: \(error)")
        }
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        installBridgeIfNeeded()
    }

    /// Lazily install the NativeAudioBridge on the WKWebView once it exists.
    /// The Capacitor bridge creates the web view during viewDidLoad of its
    /// CAPBridgeViewController, which runs before the first becomeActive.
    private func installBridgeIfNeeded() {
        guard !bridgeInstalled else { return }
        guard let webView = findWebView(in: window?.rootViewController?.view) else { return }
        bridgeInstalled = true
        NativeAudioBridge.shared.install(on: webView)
    }

    /// Recursively search the view hierarchy for a WKWebView.
    private func findWebView(in view: UIView?) -> WKWebView? {
        guard let view = view else { return nil }
        if let wv = view as? WKWebView { return wv }
        for sub in view.subviews {
            if let found = findWebView(in: sub) { return found }
        }
        return nil
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
