// LatencyAudio.swift — Capacitor plugin for native audio playback on iOS.
//
// Replaces the web <audio> element with AVPlayer so the app fully owns the
// MPRemoteCommandCenter. This gives the lock screen prev/next-track buttons
// instead of the ±10s skip that WKWebView forces.
//
// Also taps AVAudioEngine for real-time audio levels (visualizer data).

import Capacitor
import AVFoundation
import MediaPlayer

@objc(LatencyAudio)
public class LatencyAudio: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "LatencyAudio"
    public let jsName = "LatencyAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "load", selector: #selector(loadURL(_:))),
        CAPPluginMethod(name: "play", selector: #selector(play(_:))),
        CAPPluginMethod(name: "pause", selector: #selector(pause(_:))),
        CAPPluginMethod(name: "seek", selector: #selector(seek(_:))),
        CAPPluginMethod(name: "setVolume", selector: #selector(setVolume(_:))),
        CAPPluginMethod(name: "getPosition", selector: #selector(getPosition(_:))),
        CAPPluginMethod(name: "getDuration", selector: #selector(getDuration(_:))),
        CAPPluginMethod(name: "isPlaying", selector: #selector(isPlaying(_:))),
        CAPPluginMethod(name: "setMetadata", selector: #selector(setMetadata(_:))),
        CAPPluginMethod(name: "startLevelAnalysis", selector: #selector(startLevelAnalysis(_:))),
        CAPPluginMethod(name: "stopLevelAnalysis", selector: #selector(stopLevelAnalysis(_:)))
    ]

    // MARK: - State

    private var player: AVPlayer?
    private var timeObserver: Any?
    private var didEndObserver: NSObjectProtocol?
    private var currentURL: URL?

    private let engine = AVAudioEngine()
    private var mixerTapInstalled = false
    private var levelTimer: Timer?

    // Remote command handlers (kept as references for cleanup)
    private var nextHandler: NSObjectProtocol?
    private var prevHandler: NSObjectProtocol?
    private var playHandler: NSObjectProtocol?
    private var pauseHandler: NSObjectProtocol?

    // MARK: - Lifecycle

    override public func load(_ plugin: CAPPlugin) {
        super.load(plugin)
        setupRemoteCommands()
    }

    deinit {
        cleanup()
    }

    // MARK: - Commands from JS

    @objc func loadURL(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("Invalid URL")
            return
        }

        // Tear down previous player
        teardownPlayer()

        let playerItem = AVPlayerItem(url: url)
        let avPlayer = AVPlayer(playerItem: playerItem)
        avPlayer.allowsExternalPlayback = true

        self.player = avPlayer
        self.currentURL = url

        // Observe time (periodic, ~5Hz — enough for progress bar)
        let interval = CMTime(seconds: 0.2, preferredTimescale: 600)
        timeObserver = avPlayer.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard let self = self else { return }
            let sec = time.seconds
            guard sec.isFinite else { return }
            let duration = avPlayer.currentItem?.duration.seconds ?? 0
            self.notifyListeners("timeUpdate", data: [
                "position": sec,
                "duration": duration.isFinite ? duration : 0
            ])
        }

        // Observe end of playback
        didEndObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: playerItem,
            queue: .main
        ) { [weak self] _ in
            self?.notifyListeners("ended", data: [:])
        }

        call.resolve(["ok": true])
    }

    @objc func play(_ call: CAPPluginCall) {
        player?.play()
        notifyListeners("playingChange", data: ["playing": true])
        call.resolve(["ok": true])
    }

    @objc func pause(_ call: CAPPluginCall) {
        player?.pause()
        notifyListeners("playingChange", data: ["playing": false])
        call.resolve(["ok": true])
    }

    @objc func seek(_ call: CAPPluginCall) {
        guard let time = call.getDouble("time") else {
            call.reject("Missing time")
            return
        }
        let cmTime = CMTime(seconds: time, preferredTimescale: 600)
        player?.seek(to: cmTime, toleranceBefore: .zero, toleranceAfter: .zero)
        call.resolve(["ok": true])
    }

    @objc func setVolume(_ call: CAPPluginCall) {
        guard let volume = call.getFloat("volume") else {
            call.reject("Missing volume")
            return
        }
        player?.volume = volume
        call.resolve(["ok": true])
    }

    @objc func getPosition(_ call: CAPPluginCall) {
        let sec = player?.currentTime().seconds ?? 0
        call.resolve(["position": sec.isFinite ? sec : 0])
    }

    @objc func getDuration(_ call: CAPPluginCall) {
        let dur = player?.currentItem?.duration.seconds ?? 0
        call.resolve(["duration": dur.isFinite ? dur : 0])
    }

    @objc func isPlaying(_ call: CAPPluginCall) {
        let playing = player?.timeControlStatus == .playing
        call.resolve(["playing": playing])
    }

    @objc func setMetadata(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? ""
        let artist = call.getString("artist") ?? ""
        let artworkURL = call.getString("artwork")

        var nowPlayingInfo: [String: Any] = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: artist,
            MPMediaItemPropertyAlbumTitle: "Latency"
        ]

        if let artURLString = artworkURL, let artURL = URL(string: artURLString) {
            // Load artwork asynchronously to avoid blocking JS
            DispatchQueue.global().async {
                if let data = try? Data(contentsOf: artURL),
                   let image = UIImage(data: data) {
                    let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                    nowPlayingInfo[MPMediaItemPropertyArtwork] = artwork
                    MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
                } else {
                    MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
                }
            }
        } else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
        }

        // Also update position/duration in now-playing info
        updateNowPlayingPosition()

        call.resolve(["ok": true])
    }

    @objc func startLevelAnalysis(_ call: CAPPluginCall) {
        installMixerTap()
        let intervalMs = call.getDouble("interval") ?? 50
        startLevelTimer(intervalMs: intervalMs)
        call.resolve(["ok": true])
    }

    @objc func stopLevelAnalysis(_ call: CAPPluginCall) {
        stopLevelTimer()
        call.resolve(["ok": true])
    }

    // MARK: - Remote Commands (Lock Screen)

    private func setupRemoteCommands() {
        let cc = MPRemoteCommandCenter.shared()

        // Disable scrub/skip — the whole point of this plugin
        cc.skipForwardCommand.isEnabled = false
        cc.skipBackwardCommand.isEnabled = false
        cc.changePlaybackPositionCommand.isEnabled = false

        // Play / Pause
        playHandler = cc.playCommand.addTarget { [weak self] _ in
            self?.player?.play()
            self?.notifyListeners("playingChange", data: ["playing": true])
            return .success
        }
        pauseHandler = cc.pauseCommand.addTarget { [weak self] _ in
            self?.player?.pause()
            self?.notifyListeners("playingChange", data: ["playing": false])
            return .success
        }
        cc.togglePlayPauseCommand.isEnabled = true

        // Next / Previous track — tell JS to switch tracks
        nextHandler = cc.nextTrackCommand.addTarget { [weak self] _ in
            self?.notifyListeners("nextTrack", data: [:])
            return .success
        }
        prevHandler = cc.previousTrackCommand.addTarget { [weak self] _ in
            self?.notifyListeners("previousTrack", data: [:])
            return .success
        }
        cc.nextTrackCommand.isEnabled = true
        cc.previousTrackCommand.isEnabled = true
    }

    // MARK: - Audio Engine (Visualizer Levels)

    private func installMixerTap() {
        guard !mixerTapInstalled else { return }
        let mixer = engine.mainMixerNode
        let format = mixer.outputFormat(forBus: 0)

        mixer.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self = self else { return }
            let levels = self.computeLevels(buffer: buffer)
            self.notifyListeners("audioLevels", data: ["levels": levels])
        }
        mixerTapInstalled = true
    }

    private func computeLevels(buffer: AVAudioPCMBuffer) -> [Float] {
        guard let channelData = buffer.floatChannelData else { return [] }
        let frameLength = Int(buffer.frameLength)
        let channelDataValue = channelData.pointee

        // Compute RMS over chunks → 32 bars (like desktop Waveform default)
        let numBars = 32
        let chunkSize = max(1, frameLength / numBars)
        var levels: [Float] = []
        levels.reserveCapacity(numBars)

        for i in 0..<numBars {
            let start = i * chunkSize
            let end = min(start + chunkSize, frameLength)
            var sum: Float = 0
            for j in start..<end {
                let sample = channelDataValue[j]
                sum += sample * sample
            }
            let rms = sqrt(sum / Float(end - start))
            // Normalize to 0..1 (audio is typically -1..1, RMS is lower)
            levels.append(min(1.0, rms * 3.0))
        }
        return levels
    }

    private func startLevelTimer(intervalMs: Double) {
        stopLevelTimer()
        // Engine runs continuously once tapped; the tap callback delivers levels.
        // We use a timer only to pace the engine's running state.
        do {
            try engine.start()
        } catch {
            print("LatencyAudio: AVAudioEngine start failed: \(error)")
        }
    }

    private func stopLevelTimer() {
        levelTimer?.invalidate()
        levelTimer = nil
    }

    // MARK: - Now-Playing Info

    private func updateNowPlayingPosition() {
        guard let player = player else { return }
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        let pos = player.currentTime().seconds
        let dur = player.currentItem?.duration.seconds ?? 0
        if pos.isFinite { info[MPNowPlayingInfoPropertyPlaybackPosition] = pos }
        if dur.isFinite { info[MPMediaItemPropertyPlaybackDuration] = dur }
        info[MPNowPlayingInfoPropertyPlaybackRate] = player.timeControlStatus == .playing ? 1.0 : 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    // MARK: - Cleanup

    private func teardownPlayer() {
        if let obs = timeObserver, let p = player {
            p.removeTimeObserver(obs)
        }
        timeObserver = nil
        if let obs = didEndObserver {
            NotificationCenter.default.removeObserver(obs)
        }
        didEndObserver = nil
        player?.pause()
        player = nil
        currentURL = nil
    }

    private func cleanup() {
        teardownPlayer()
        stopLevelTimer()

        let cc = MPRemoteCommandCenter.shared()
        if let h = nextHandler { cc.nextTrackCommand.removeTarget(h) }
        if let h = prevHandler { cc.previousTrackCommand.removeTarget(h) }
        if let h = playHandler { cc.playCommand.removeTarget(h) }
        if let h = pauseHandler { cc.pauseCommand.removeTarget(h) }

        if mixerTapInstalled {
            engine.mainMixerNode.removeTap(onBus: 0)
            mixerTapInstalled = false
        }
        engine.stop()
    }
}
