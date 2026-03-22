import { describe, it, expect } from "vitest";
import {
  float32ToInt16,
  arrayBufferToBase64,
  base64ToInt16,
  int16ToFloat32,
} from "../lib/audio-utils";

// ── float32ToInt16 ────────────────────────────────────────────

describe("float32ToInt16", () => {
  it("converts 0.0 to 0", () => {
    const result = float32ToInt16(new Float32Array([0.0]));
    expect(result[0]).toBe(0);
  });

  it("converts 1.0 to max positive int16 (32767)", () => {
    const result = float32ToInt16(new Float32Array([1.0]));
    expect(result[0]).toBe(32767);
  });

  it("converts -1.0 to min negative int16 (-32768)", () => {
    const result = float32ToInt16(new Float32Array([-1.0]));
    expect(result[0]).toBe(-32768);
  });

  it("clamps values above 1.0 to 32767", () => {
    const result = float32ToInt16(new Float32Array([2.5]));
    expect(result[0]).toBe(32767);
  });

  it("clamps values below -1.0 to -32768", () => {
    const result = float32ToInt16(new Float32Array([-3.0]));
    expect(result[0]).toBe(-32768);
  });

  it("preserves length", () => {
    const input = new Float32Array([0.1, -0.2, 0.5, -0.7, 0.0]);
    const result = float32ToInt16(input);
    expect(result.length).toBe(5);
  });

  it("round-trips correctly via int16ToFloat32 (within ±1/32768 precision)", () => {
    const original = new Float32Array([0.25, -0.5, 0.75, -0.125]);
    const int16 = float32ToInt16(original);
    const back = int16ToFloat32(int16);
    for (let i = 0; i < original.length; i++) {
      expect(back[i]).toBeCloseTo(original[i], 3);
    }
  });
});

// ── int16ToFloat32 ────────────────────────────────────────────

describe("int16ToFloat32", () => {
  it("converts 0 to 0.0", () => {
    const result = int16ToFloat32(new Int16Array([0]));
    expect(result[0]).toBe(0);
  });

  it("converts 32767 to ~1.0 (positive saturation)", () => {
    const result = int16ToFloat32(new Int16Array([32767]));
    expect(result[0]).toBeCloseTo(1.0, 3);
  });

  it("converts -32768 to -1.0 (negative saturation)", () => {
    const result = int16ToFloat32(new Int16Array([-32768]));
    expect(result[0]).toBeCloseTo(-1.0, 3);
  });

  it("produces values in [-1, 1] range", () => {
    const input = new Int16Array([0, 16384, -16384, 32767, -32768]);
    const result = int16ToFloat32(input);
    for (const v of result) {
      expect(v).toBeGreaterThanOrEqual(-1.0);
      expect(v).toBeLessThanOrEqual(1.0);
    }
  });

  it("preserves length", () => {
    const input = new Int16Array(100);
    expect(int16ToFloat32(input).length).toBe(100);
  });
});

// ── arrayBufferToBase64 / base64ToInt16 round-trip ────────────

describe("base64 encoding round-trip", () => {
  it("encodes and decodes a known Int16Array", () => {
    const original = new Int16Array([100, -200, 32767, -32768, 0]);
    const base64 = arrayBufferToBase64(original.buffer);

    // base64 should be a non-empty string
    expect(typeof base64).toBe("string");
    expect(base64.length).toBeGreaterThan(0);

    // Decode back
    const decoded = base64ToInt16(base64);
    expect(decoded.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(decoded[i]).toBe(original[i]);
    }
  });

  it("produces valid base64 characters only", () => {
    const data = new Int16Array([1, 2, 3, 4]);
    const base64 = arrayBufferToBase64(data.buffer);
    expect(base64).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("handles an empty buffer", () => {
    const base64 = arrayBufferToBase64(new ArrayBuffer(0));
    expect(base64).toBe("");
    const decoded = base64ToInt16(base64);
    expect(decoded.length).toBe(0);
  });

  it("round-trips a large buffer (4096 samples — one worklet chunk)", () => {
    const samples = new Int16Array(4096);
    // Fill with a sawtooth pattern
    for (let i = 0; i < 4096; i++) samples[i] = (i % 65536) - 32768;
    const base64 = arrayBufferToBase64(samples.buffer);
    const decoded = base64ToInt16(base64);
    expect(decoded.length).toBe(4096);
    expect(decoded[0]).toBe(samples[0]);
    expect(decoded[4095]).toBe(samples[4095]);
  });
});

// ── PCM data integrity: float32 → int16 → base64 → int16 → float32 ──

describe("full PCM pipeline integrity", () => {
  it("float32 mic data survives encode → transmit → decode round-trip", () => {
    // Simulate 256 samples of a 440 Hz sine at 16 kHz
    const sampleRate = 16000;
    const freq = 440;
    const numSamples = 256;
    const input = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      input[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
    }

    // Step 1: float32 → int16 (what the worklet does before sending)
    const int16 = float32ToInt16(input);

    // Step 2: int16 → base64 (what arrayBufferToBase64 does)
    const base64 = arrayBufferToBase64(int16.buffer);

    // Step 3: base64 → int16 (what the receiver does)
    const decodedInt16 = base64ToInt16(base64);

    // Step 4: int16 → float32 (what the player does before playback)
    const output = int16ToFloat32(decodedInt16);

    expect(output.length).toBe(numSamples);
    for (let i = 0; i < numSamples; i++) {
      // Allow ±1/32768 quantisation error
      expect(output[i]).toBeCloseTo(input[i], 3);
    }
  });
});
