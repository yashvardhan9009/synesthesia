import { useEffect, useRef, useState } from "react";
import { frequencyBin, logBands, peakFrequency, triggerIndex } from "../audio/analysis.ts";
import { useAudioFrame } from "./audioBus.ts";

type Props = {
  kind: "wave" | "spectrum";
  label: string;
  width?: number;
  height?: number;
  /** Draw the note and Hz in the corner. */
  readout?: boolean;
};

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

const SPECTRUM_LOW_HZ = 40;
const SPECTRUM_HIGH_HZ = 8000;
const SPECTRUM_TICKS = [100, 1000];

/**
 * Oscilloscope or spectrum of the real output. Flat when nothing is sounding.
 * The waveform is triggered on a rising zero crossing so a held note stands still.
 * The spectrum is log-spaced from 40 Hz to 8 kHz, with an amber mark at the note
 * the engine is playing, and the note name and Hz drawn in the corner.
 */
export function Scope({ kind, label, width = 240, height = 48, readout = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colors = useRef({ trace: "#52d4e6", grid: "#1b2c3b", hot: "#ffb347", text: "#9aacbb", bg: "#04070b" });

  useEffect(() => {
    const read = () => {
      colors.current = {
        trace: cssVar("--signal", "#52d4e6"),
        grid: cssVar("--line", "#1b2c3b"),
        hot: cssVar("--heat", "#ffb347"),
        text: cssVar("--muted", "#9aacbb"),
        bg: cssVar("--bg", "#04070b"),
      };
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useAudioFrame((frame) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== width * ratio) {
      canvas.width = width * ratio;
      canvas.height = height * ratio;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const { trace, grid, hot, text, bg } = colors.current;
    const note = frame.live && frame.note && frame.note.frequency > 0 ? frame.note : null;
    const xOf = (hz: number) => (Math.log(hz / SPECTRUM_LOW_HZ) / Math.log(SPECTRUM_HIGH_HZ / SPECTRUM_LOW_HZ)) * width;

    context.strokeStyle = grid;
    context.lineWidth = 1;
    context.beginPath();
    if (kind === "wave") {
      for (let x = 0; x <= width; x += width / 8) {
        context.moveTo(Math.round(x) + 0.5, 0);
        context.lineTo(Math.round(x) + 0.5, height);
      }
    } else {
      for (const hz of SPECTRUM_TICKS) {
        const x = Math.round(xOf(hz)) + 0.5;
        context.moveTo(x, 0);
        context.lineTo(x, height);
      }
    }
    context.moveTo(0, Math.round(height / 2) + 0.5);
    context.lineTo(width, Math.round(height / 2) + 0.5);
    context.stroke();

    if (kind === "wave") {
      const data = frame.wave;
      const offset = triggerIndex(data);
      context.strokeStyle = trace;
      context.lineWidth = 1.5;
      context.shadowColor = trace;
      context.shadowBlur = frame.live ? 6 : 0;
      context.beginPath();
      const count = Math.min(data.length - offset, 512);
      for (let index = 0; index < count; index += 1) {
        const x = (index / (count - 1)) * width;
        const y = height / 2 + ((data[index + offset] - 128) / 128) * (height / 2 - 3) * 1.6;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
      context.shadowBlur = 0;
    } else {
      const data = frame.spectrum;
      const bars = Math.max(16, Math.floor(width / 5));
      const gap = 1;
      const barWidth = (width - gap * (bars - 1)) / bars;
      const edges = logBands(bars, SPECTRUM_LOW_HZ, SPECTRUM_HIGH_HZ);
      for (let bar = 0; bar < bars; bar += 1) {
        const from = Math.floor(frequencyBin(edges[bar], frame.sampleRate, data.length));
        const to = Math.max(from + 1, Math.ceil(frequencyBin(edges[bar + 1], frame.sampleRate, data.length)));
        let peak = 0;
        for (let index = from; index < to && index < data.length; index += 1) peak = Math.max(peak, data[index]);
        const value = peak / 255;
        const h = Math.max(1, value * (height - 2));
        context.fillStyle = value > 0.82 ? hot : trace;
        context.globalAlpha = 0.35 + value * 0.65;
        context.fillRect(bar * (barWidth + gap), height - h, barWidth, h);
      }
      context.globalAlpha = 1;
      if (note && note.frequency >= SPECTRUM_LOW_HZ && note.frequency <= SPECTRUM_HIGH_HZ) {
        const x = Math.round(xOf(note.frequency)) + 0.5;
        context.strokeStyle = hot;
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }
    }

    if (readout && height >= 28) {
      context.font = "10px 'IBM Plex Mono', ui-monospace, monospace";
      context.textBaseline = "top";
      const words = note ? `${note.name}  ${note.frequency.toFixed(1)} Hz` : kind === "spectrum" ? "40 Hz – 8 kHz" : "";
      const label = (value: string, y: number) => {
        context.fillStyle = bg;
        context.fillRect(1, y - 1, context.measureText(value).width + 5, 12);
        context.fillStyle = note ? hot : text;
        context.fillText(value, 3, y);
      };
      if (words) label(words, 2);
      if (kind === "spectrum" && !note) {
        const peak = frame.live ? peakFrequency(frame.spectrum, frame.sampleRate) : null;
        if (peak) label(`peak ${Math.round(peak)} Hz`, 14);
      }
    }
  });

  return <canvas ref={canvasRef} className="scope" style={{ width, height }} role="img" aria-label={label} />;
}

/** The sounding note as text, for places that want it outside the canvas. Not live: the caption already speaks. */
export function NoteReadout({ className }: { className?: string }) {
  const [note, setNote] = useState<{ name: string; hz: string } | null>(null);
  const last = useRef("");
  useAudioFrame((frame) => {
    const current = frame.live && frame.note && frame.note.frequency > 0 ? frame.note : null;
    const key = current ? `${current.name}|${current.frequency.toFixed(1)}` : "";
    if (key === last.current) return;
    last.current = key;
    setNote(current ? { name: current.name, hz: current.frequency.toFixed(1) } : null);
  });
  return (
    <span className={className ?? "note-readout"}>
      <span className="label">Note</span> <b>{note ? note.name : "—"}</b>{" "}
      <span className="label">Hz</span> <b>{note ? note.hz : "—"}</b>
    </span>
  );
}

/** Writes the output level to --level on <html> for the playhead glow and status lamp. */
export function LevelMeter({ still }: { still: boolean }) {
  const last = useRef(-1);
  useAudioFrame((frame) => {
    const value = still ? (frame.live ? 0.5 : 0) : Math.round(frame.level * 50) / 50;
    if (value === last.current) return;
    last.current = value;
    document.documentElement.style.setProperty("--level", String(value));
    document.documentElement.classList.toggle("sounding", frame.live);
  });
  return null;
}
