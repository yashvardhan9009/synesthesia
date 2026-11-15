import { describe, expect, it } from "vitest";
import { encodeWav, normalizePeak, postcardFileName } from "./wav.ts";

describe("encodeWav", () => {
  it("writes a valid stereo 16-bit header and interleaved samples", () => {
    const left = new Float32Array([0, 1, -1]);
    const right = new Float32Array([0.5, -0.5, 2]);
    const buffer = encodeWav([left, right], 44100);
    const view = new DataView(buffer);
    const tag = (offset: number) => String.fromCharCode(...new Uint8Array(buffer, offset, 4));
    expect(tag(0)).toBe("RIFF");
    expect(tag(8)).toBe("WAVE");
    expect(tag(36)).toBe("data");
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(28, true)).toBe(44100 * 4);
    expect(view.getUint32(40, true)).toBe(3 * 4);
    expect(buffer.byteLength).toBe(44 + 12);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(Math.round(0.5 * 0x7fff));
    expect(view.getInt16(48, true)).toBe(0x7fff);
    expect(view.getInt16(52, true)).toBe(-0x8000);
    // Clipped above 1.
    expect(view.getInt16(54, true)).toBe(0x7fff);
  });
});

describe("postcardFileName", () => {
  it("is lowercase, hyphenated and ASCII", () => {
    expect(postcardFileName("São Paulo, Brazil", "20250601", "20250630")).toBe("synesthesia-sao-paulo-brazil-20250601-20250630.wav");
    expect(postcardFileName("!!!", "1", "2")).toBe("synesthesia-earth-1-2.wav");
  });
});

describe("normalizePeak", () => {
  it("brings the loudest sample to the target with one shared gain", () => {
    const left = new Float32Array([0.1, -0.2]);
    const right = new Float32Array([0.05, 0]);
    const gain = normalizePeak([left, right], 0.8);
    expect(gain).toBeCloseTo(4);
    expect(left[1]).toBeCloseTo(-0.8);
    expect(right[0]).toBeCloseTo(0.2);
  });
  it("leaves silence alone and caps the boost", () => {
    const silent = new Float32Array(4);
    expect(normalizePeak([silent])).toBe(1);
    const quiet = new Float32Array([0.001]);
    expect(normalizePeak([quiet], 0.9, 8)).toBe(8);
  });
});
