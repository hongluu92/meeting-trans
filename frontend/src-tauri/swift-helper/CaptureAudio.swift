// CaptureAudio.swift
// Captures system audio via ScreenCaptureKit and outputs raw float32 PCM at 16kHz to stdout.
// Usage: ./capture-audio [start]
// Reads "stop\n" from stdin to gracefully stop.

import Accelerate
import AVFoundation
import Foundation
import ScreenCaptureKit

@available(macOS 13.0, *)
class AudioCapturer: NSObject, SCStreamOutput {
    private var stream: SCStream?
    private let outputSampleRate: Double = 16000.0
    private var converter: AVAudioConverter?
    private var isRunning = false

    func start() async throws {
        // Get shareable content (triggers permission dialog on first run)
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)

        // Create a filter that captures all desktop audio
        let display = content.displays.first!
        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])

        // Configure for audio-only capture
        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true  // Don't capture our own app's audio
        config.channelCount = 1
        config.sampleRate = 48000  // ScreenCaptureKit native rate

        // Set up converter from 48kHz to 16kHz
        let inputFormat = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
        let outputFormat = AVAudioFormat(standardFormatWithSampleRate: outputSampleRate, channels: 1)!
        converter = AVAudioConverter(from: inputFormat, to: outputFormat)

        stream = SCStream(filter: filter, configuration: config, delegate: nil)
        try stream!.addStreamOutput(self, type: .audio, sampleHandlerQueue: .global(qos: .userInteractive))
        try await stream!.startCapture()
        isRunning = true

        // Signal ready to parent process
        FileHandle.standardError.write("READY\n".data(using: .utf8)!)
    }

    func stop() async {
        guard isRunning, let stream = stream else { return }
        try? await stream.stopCapture()
        isRunning = false
    }

    // SCStreamOutput delegate — receives audio buffers
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }
        guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { return }

        var length = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        CMBlockBufferGetDataPointer(blockBuffer, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &length, dataPointerOut: &dataPointer)
        guard let dataPointer = dataPointer, length > 0 else { return }

        // Get audio format from sample buffer
        guard let formatDesc = CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc) else { return }

        let sampleRate = asbd.pointee.mSampleRate
        let channelCount = asbd.pointee.mChannelsPerFrame
        let frameCount = length / MemoryLayout<Float>.size / Int(channelCount)

        guard frameCount > 0 else { return }

        // Convert to mono float32 if needed
        let floatData = UnsafeRawPointer(dataPointer).bindMemory(to: Float.self, capacity: frameCount * Int(channelCount))
        var monoData = [Float](repeating: 0, count: frameCount)

        if channelCount > 1 {
            // Mix down to mono
            for i in 0..<frameCount {
                var sum: Float = 0
                for ch in 0..<Int(channelCount) {
                    sum += floatData[i * Int(channelCount) + ch]
                }
                monoData[i] = sum / Float(channelCount)
            }
        } else {
            monoData = Array(UnsafeBufferPointer(start: floatData, count: frameCount))
        }

        // Resample from source rate to 16kHz
        let ratio = outputSampleRate / sampleRate
        let outputFrames = Int(Double(frameCount) * ratio)

        if abs(ratio - 1.0) < 0.001 {
            // No resampling needed
            writeToStdout(monoData)
        } else {
            // Simple linear interpolation resampling
            var resampled = [Float](repeating: 0, count: outputFrames)
            for i in 0..<outputFrames {
                let srcIdx = Double(i) / ratio
                let idx0 = Int(srcIdx)
                let frac = Float(srcIdx - Double(idx0))
                let idx1 = min(idx0 + 1, frameCount - 1)
                resampled[i] = monoData[idx0] * (1.0 - frac) + monoData[idx1] * frac
            }
            writeToStdout(resampled)
        }
    }

    private func writeToStdout(_ samples: [Float]) {
        samples.withUnsafeBufferPointer { buffer in
            let data = Data(bytes: buffer.baseAddress!, count: buffer.count * MemoryLayout<Float>.size)
            FileHandle.standardOutput.write(data)
        }
    }
}

// --- Main ---

guard #available(macOS 13.0, *) else {
    FileHandle.standardError.write("ERROR: macOS 13.0+ required for ScreenCaptureKit\n".data(using: .utf8)!)
    exit(1)
}

let capturer = AudioCapturer()

// Start capture
Task {
    do {
        try await capturer.start()
    } catch {
        FileHandle.standardError.write("ERROR: \(error.localizedDescription)\n".data(using: .utf8)!)
        exit(1)
    }
}

// Wait for "stop" on stdin to shut down
DispatchQueue.global().async {
    while let line = readLine() {
        if line.trimmingCharacters(in: .whitespacesAndNewlines) == "stop" {
            Task {
                await capturer.stop()
                exit(0)
            }
        }
    }
    // stdin closed (parent died)
    Task {
        await capturer.stop()
        exit(0)
    }
}

RunLoop.main.run()
