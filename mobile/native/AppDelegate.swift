// Full AppDelegate copied over the Capacitor-generated one during the iOS build
// (see scripts/patch-ios.sh). Pinned to the Capacitor 8 template structure.
//
// Native pieces:
//   1. AVAudioSession .playback → audio when locked/backgrounded.
//   2. NativeAudioBridge → WKScriptMessageHandler for lock-screen prev/next-track
//      and native AVPlayer playback. Handles both network URLs and base64-encoded
//      blob data (for offline files that can't be played via blob: URLs).
import UIKit
import Capacitor
import AVFoundation
import MediaPlayer
import WebKit

// MARK: - NativeAudioBridge

class NativeAudioBridge: NSObject, WKScriptMessageHandler {

    static let handlerName = "latencyAudio"
    static let shared = NativeAudioBridge()

    private weak var webView: WKWebView?
    private var player: AVPlayer?
    private var timeObserver: Any?
    private var statusObserver: NSKeyValueObservation?
    private var didEndObserver: NSObjectProtocol?
    private var nextHandler: NSObjectProtocol?
    private var prevHandler: NSObjectProtocol?
    private var playHandler: NSObjectProtocol?
    private var pauseHandler: NSObjectProtocol?

    private override init() { super.init() }

    func install(on webView: WKWebView) {
        self.webView = webView
        webView.configuration.userContentController.add(self, name: Self.handlerName)
        setupRemoteCommands()
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.handlerName,
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "load":
            guard let urlStr = body["url"] as? String, let url = URL(string: urlStr) else { return }
            loadURL(url)
        case "loadBase64":
            guard let b64 = body["base64"] as? String else { return }
            loadBase64(b64)
        case "play":
            // Re-assert the playback session right before playing. If the session
            // isn't active / in the .playback category at this moment, a native
            // AVPlayer produces NO audio (and obeys the ring/silent switch). This
            // is the usual cause of "it switches tracks but there's no sound".
            Self.activatePlaybackSession()
            player?.play()
            sendEvent("playingChange", data: ["playing": true])
        case "pause":
            player?.pause()
            sendEvent("playingChange", data: ["playing": false])
        case "seek":
            if let time = body["time"] as? Double {
                player?.seek(to: CMTime(seconds: time, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
            }
        case "setVolume":
            if let vol = body["volume"] as? Float { player?.volume = vol }
        case "setMetadata":
            setMetadata(
                title: body["title"] as? String ?? "",
                artist: body["artist"] as? String ?? "",
                artwork: body["artwork"] as? String
            )
        case "getPosition":
            let sec = player?.currentTime().seconds ?? 0
            sendEvent("positionResult", data: ["position": sec.isFinite ? sec : 0])
        case "getDuration":
            let dur = player?.currentItem?.duration.seconds ?? 0
            sendEvent("durationResult", data: ["duration": dur.isFinite ? dur : 0])
        default:
            break
        }
    }

    // MARK: - Audio session

    /// Force the app's audio session into .playback and activate it. Safe to call
    /// repeatedly. Reports failures to JS so they surface in-app instead of being
    /// silent. `.playback` is what makes audio ignore the ring/silent switch and
    /// keep going when the screen locks.
    @discardableResult
    static func activatePlaybackSession() -> Bool {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(true)
            return true
        } catch {
            NativeAudioBridge.shared.reportError("audio session: \(error.localizedDescription)")
            return false
        }
    }

    func reportError(_ message: String) {
        sendEvent("nativeError", data: ["message": message])
    }

    // MARK: - Audio Loading

    // A desktop-browser User-Agent. SoundCloud / Yandex CDNs reject AVPlayer's
    // default "AppleCoreMedia" UA (→ 403 → "Cannot Open"); the same URL plays in a
    // web <audio> element because it sends a browser UA. Pass it via AVURLAsset.
    private static let browserUA =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 " +
        "(KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"

    private func loadURL(_ url: URL) {
        teardownPlayer()
        let asset = AVURLAsset(url: url, options: [
            "AVURLAssetHTTPHeaderFieldsKey": ["User-Agent": Self.browserUA]
        ])
        let item = AVPlayerItem(asset: asset)
        let av = AVPlayer(playerItem: item)
        av.allowsExternalPlayback = true
        self.player = av
        attachObservers(av)
    }

    /// Load from base64-encoded audio data (for blob: URLs that AVPlayer can't handle).
    private func loadBase64(_ b64: String) {
        guard let data = Data(base64Encoded: b64) else { return }
        // Write to a temp file — AVPlayer needs a file or network URL
        // SoundCloud / Yandex progressive downloads are MP3 — name the temp file
        // .mp3 so AVPlayer's container sniffing doesn't choke on a wrong extension.
        let tmp = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("lp_audio_\(ProcessInfo.processInfo.globallyUniqueString).mp3")
        do {
            try data.write(to: tmp)
        } catch {
            print("NativeAudioBridge: failed to write temp file: \(error)")
            return
        }
        teardownPlayer()
        let item = AVPlayerItem(url: tmp)
        let av = AVPlayer(playerItem: item)
        av.allowsExternalPlayback = true
        self.player = av
        attachObservers(av)
    }

    private func attachObservers(_ av: AVPlayer) {
        let interval = CMTime(seconds: 0.2, preferredTimescale: 600)
        timeObserver = av.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            let sec = time.seconds
            guard sec.isFinite else { return }
            let dur = av.currentItem?.duration.seconds ?? 0
            self?.sendEvent("timeUpdate", data: ["position": sec, "duration": dur.isFinite ? dur : 0])
        }
        if let item = av.currentItem {
            didEndObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
            ) { [weak self] _ in
                self?.sendEvent("ended", data: [:])
            }
            // Surface load failures (bad URL, unsupported codec, offline file with
            // wrong extension, expired signed URL, …) to JS instead of failing mute.
            statusObserver = item.observe(\.status, options: [.new]) { [weak self] it, _ in
                if it.status == .failed {
                    let e = it.error as NSError?
                    let base = e?.localizedDescription ?? "AVPlayerItem failed"
                    let msg = "\(base) [\(e?.domain ?? "?"):\(e?.code ?? 0)]"
                    self?.reportError(msg)
                }
            }
        }
    }

    private func teardownPlayer() {
        if let obs = timeObserver, let p = player { p.removeTimeObserver(obs) }
        timeObserver = nil
        if let obs = didEndObserver { NotificationCenter.default.removeObserver(obs) }
        didEndObserver = nil
        statusObserver?.invalidate(); statusObserver = nil
        player?.pause(); player = nil
    }

    // MARK: - Lock Screen

    private func setupRemoteCommands() {
        let cc = MPRemoteCommandCenter.shared()
        cc.skipForwardCommand.isEnabled = false
        cc.skipBackwardCommand.isEnabled = false
        cc.changePlaybackPositionCommand.isEnabled = false
        playHandler = cc.playCommand.addTarget { [weak self] _ in
            self?.player?.play()
            self?.sendEvent("playingChange", data: ["playing": true])
            return .success
        } as? NSObjectProtocol
        pauseHandler = cc.pauseCommand.addTarget { [weak self] _ in
            self?.player?.pause()
            self?.sendEvent("playingChange", data: ["playing": false])
            return .success
        } as? NSObjectProtocol
        cc.togglePlayPauseCommand.isEnabled = true
        nextHandler = cc.nextTrackCommand.addTarget { [weak self] _ in
            self?.sendEvent("nextTrack", data: [:])
            return .success
        } as? NSObjectProtocol
        prevHandler = cc.previousTrackCommand.addTarget { [weak self] _ in
            self?.sendEvent("previousTrack", data: [:])
            return .success
        } as? NSObjectProtocol
        cc.nextTrackCommand.isEnabled = true
        cc.previousTrackCommand.isEnabled = true
    }

    // MARK: - Metadata

    private func setMetadata(title: String, artist: String, artwork: String?) {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: artist,
            MPMediaItemPropertyAlbumTitle: "Latency"
        ]
        if let artStr = artwork, let artURL = URL(string: artStr) {
            DispatchQueue.global().async {
                if let data = try? Data(contentsOf: artURL), let img = UIImage(data: data) {
                    info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: img.size) { _ in img }
                }
                MPNowPlayingInfoCenter.default().nowPlayingInfo = info
            }
        } else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        }
        if let p = player {
            var i = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
            let pos = p.currentTime().seconds
            let dur = p.currentItem?.duration.seconds ?? 0
            if pos.isFinite { i[MPNowPlayingInfoPropertyElapsedPlaybackTime] = pos }
            if dur.isFinite { i[MPMediaItemPropertyPlaybackDuration] = dur }
            i[MPNowPlayingInfoPropertyPlaybackRate] = p.timeControlStatus == .playing ? 1.0 : 0.0
            MPNowPlayingInfoCenter.default().nowPlayingInfo = i
        }
    }

    // MARK: - JS Communication

    private func sendEvent(_ name: String, data: [String: Any]) {
        var json = data
        json["_event"] = name
        guard let jsonData = try? JSONSerialization.data(withJSONObject: json),
              let jsonStr = String(data: jsonData, encoding: .utf8) else { return }
        let js = "window.__nativeAudioEvent && window.__nativeAudioEvent(\(jsonStr))"
        webView?.evaluateJavaScript(js)
    }
}

// MARK: - AppDelegate

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var bridgeInstalled = false

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        NativeAudioBridge.activatePlaybackSession()
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        installBridgeIfNeeded()
    }

    private func installBridgeIfNeeded() {
        guard !bridgeInstalled else { return }
        guard let webView = findWebView(in: window?.rootViewController?.view) else { return }
        bridgeInstalled = true
        NativeAudioBridge.shared.install(on: webView)
    }

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
