// NativeAudioBridge.swift — Direct WKScriptMessageHandler bridge for native audio.
//
// This bypasses the Capacitor plugin system entirely. It registers a message
// handler on the WKWebView's content controller, letting JS send commands
// (load/play/pause/seek/etc.) and receive events (timeUpdate/ended/etc.)
// through window.webkit.messageHandlers.latencyAudio.
//
// The lock screen prev/next-track is handled natively via MPRemoteCommandCenter.

import UIKit
import WebKit
import AVFoundation
import MediaPlayer

/// Register this on the WKWebView's content controller in AppDelegate.
/// Call `NativeAudioBridge.install(on: webView)` after the web view is created.
class NativeAudioBridge: NSObject, WKScriptMessageHandler {

    static let handlerName = "latencyAudio"

    private weak var webView: WKWebView?
    private var player: AVPlayer?
    private var timeObserver: Any?
    private var didEndObserver: NSObjectProtocol?
    private var nextHandler: NSObjectProtocol?
    private var prevHandler: NSObjectProtocol?
    private var playHandler: NSObjectProtocol?
    private var pauseHandler: NSObjectProtocol?

    // Singleton for global access from AppDelegate
    static let shared = NativeAudioBridge()

    private override init() { super.init() }

    // MARK: - Install

    func install(on webView: WKWebView) {
        self.webView = webView
        webView.configuration.userContentController.add(self, name: Self.handlerName)
        setupRemoteCommands()
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.handlerName,
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "load":
            guard let urlStr = body["url"] as? String, let url = URL(string: urlStr) else { return }
            loadURL(url)
        case "play":
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
            setMetadata(title: body["title"] as? String ?? "", artist: body["artist"] as? String ?? "", artwork: body["artwork"] as? String)
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

    // MARK: - Audio Loading

    private func loadURL(_ url: URL) {
        teardownPlayer()
        let item = AVPlayerItem(url: url)
        let av = AVPlayer(playerItem: item)
        av.allowsExternalPlayback = true
        self.player = av

        let interval = CMTime(seconds: 0.2, preferredTimescale: 600)
        timeObserver = av.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            let sec = time.seconds
            guard sec.isFinite else { return }
            let dur = av.currentItem?.duration.seconds ?? 0
            self?.sendEvent("timeUpdate", data: ["position": sec, "duration": dur.isFinite ? dur : 0])
        }
        didEndObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            self?.sendEvent("ended", data: [:])
        }
    }

    private func teardownPlayer() {
        if let obs = timeObserver, let p = player { p.removeTimeObserver(obs) }
        timeObserver = nil
        if let obs = didEndObserver { NotificationCenter.default.removeObserver(obs) }
        didEndObserver = nil
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
        }
        pauseHandler = cc.pauseCommand.addTarget { [weak self] _ in
            self?.player?.pause()
            self?.sendEvent("playingChange", data: ["playing": false])
            return .success
        }
        cc.togglePlayPauseCommand.isEnabled = true
        nextHandler = cc.nextTrackCommand.addTarget { [weak self] _ in
            self?.sendEvent("nextTrack", data: [:]); return .success
        }
        prevHandler = cc.previousTrackCommand.addTarget { [weak self] _ in
            self?.sendEvent("previousTrack", data: [:]); return .success
        }
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
        // Update position too
        if let p = player {
            var i = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
            let pos = p.currentTime().seconds
            let dur = p.currentItem?.duration.seconds ?? 0
            if pos.isFinite { i[MPNowPlayingInfoPropertyPlaybackPosition] = pos }
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
