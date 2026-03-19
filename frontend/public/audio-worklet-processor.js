/**
 * AudioWorklet processor that captures raw Float32 PCM from the microphone
 * and posts buffered samples to the main thread at ~250ms intervals.
 */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(0);
    this._bufferThreshold = 2048; // ~128ms at 16kHz
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // mono channel

    // Append to internal buffer
    const newBuffer = new Float32Array(this._buffer.length + channelData.length);
    newBuffer.set(this._buffer);
    newBuffer.set(channelData, this._buffer.length);
    this._buffer = newBuffer;

    // Flush when we have enough samples
    if (this._buffer.length >= this._bufferThreshold) {
      this.port.postMessage({ pcm: this._buffer });
      this._buffer = new Float32Array(0);
    }

    return true;
  }
}

registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
