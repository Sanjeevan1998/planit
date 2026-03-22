// ============================================================
// Planit Audio Utilities
// PCM audio capture (mic → 16kHz base64) and playback
// (24kHz base64 → speakers) for Gemini Live API.
// Uses AudioWorklet (modern, not deprecated).
// ============================================================

// --------------- Helpers (exported for unit tests) ----------

export function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

export function int16ToFloat32(int16: Int16Array): Float32Array {
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

// --------------- Worklet code (inlined as blob) -------------

// Buffers 4096 samples then posts Float32Array to main thread.
const WORKLET_CODE = `
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
    this._chunkSize = 4096;
  }
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) this._buf.push(ch[i]);
    while (this._buf.length >= this._chunkSize) {
      const chunk = this._buf.splice(0, this._chunkSize);
      this.port.postMessage(new Float32Array(chunk));
    }
    return true;
  }
}
registerProcessor('pcm-capture', PCMCaptureProcessor);
`;

// --------------- PCMAudioCapture ----------------------------

export class PCMAudioCapture {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private readonly onChunk: (base64: string) => void;

  constructor(onChunk: (base64: string) => void) {
    this.onChunk = onChunk;
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // Request 16 kHz — Gemini Live input requirement.
    // Most modern browsers honour this for AudioContext.
    this.audioContext = new AudioContext({ sampleRate: 16000 });

    // Load worklet from inline blob so we don't need a public/ file.
    const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    await this.audioContext.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    this.source = this.audioContext.createMediaStreamSource(this.stream);

    // Analyser for the orb animation (audio level visualisation).
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.source.connect(this.analyser);

    this.workletNode = new AudioWorkletNode(this.audioContext, "pcm-capture");
    this.workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
      const int16 = float32ToInt16(e.data);
      const base64 = arrayBufferToBase64(int16.buffer);
      this.onChunk(base64);
    };
    this.source.connect(this.workletNode);
    // No need to connect workletNode to destination — we only capture.
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  stop(): void {
    this.workletNode?.disconnect();
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.audioContext?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.workletNode = null;
    this.source = null;
    this.analyser = null;
    this.audioContext = null;
    this.stream = null;
  }
}

// --------------- PCMAudioPlayer -----------------------------

export class PCMAudioPlayer {
  private audioContext: AudioContext | null = null;
  private queue: Float32Array[] = [];
  private isPlaying = false;
  private nextStartTime = 0;
  // Gemini Live sends audio at 24 kHz.
  private readonly sampleRate = 24000;

  private ctx(): AudioContext {
    if (!this.audioContext || this.audioContext.state === "closed") {
      this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
    }
    return this.audioContext;
  }

  enqueue(base64: string): void {
    const float32 = int16ToFloat32(base64ToInt16(base64));
    this.queue.push(float32);
    if (!this.isPlaying) this.flush();
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      return;
    }
    this.isPlaying = true;
    const ctx = this.ctx();
    if (ctx.state === "suspended") await ctx.resume();

    const samples = this.queue.shift()!;
    const buffer = ctx.createBuffer(1, samples.length, this.sampleRate);
    buffer.copyToChannel(samples, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
    source.onended = () => this.flush();
  }

  /** Stop immediately and clear queued audio (e.g. on barge-in). */
  clear(): void {
    this.queue = [];
    this.isPlaying = false;
    this.nextStartTime = 0;
  }

  destroy(): void {
    this.clear();
    this.audioContext?.close();
    this.audioContext = null;
  }
}
