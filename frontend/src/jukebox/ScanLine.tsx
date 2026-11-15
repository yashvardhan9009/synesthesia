import { useEffect, useRef } from "react";
import type { SonificationEngine } from "../audio/engine.ts";
import { useEngineState } from "../ui/audioBus.ts";
import type { SonicEvent } from "../types.ts";
import { scanPoint } from "./scan.ts";

type Props = {
  engine: SonificationEngine;
  events: readonly SonicEvent[];
  samples: number;
  /** True when the engine's run is this frame. */
  active: boolean;
  /** Step to rest on when not playing (hand, pause), or null. */
  restingSource: number | null;
  still: boolean;
  note: { note: string; hz: string } | null;
  outlier: boolean;
  /** "scan": line, read band and note over the picture. "cursor": a thin line over the score strip. */
  variant?: "scan" | "cursor";
};

/**
 * The scan line, driven by the audio clock rather than a CSS transition: while
 * a note sounds, the line sweeps across exactly the slice it was measured from,
 * and the shaded band is that slice. With reduced motion it steps instead.
 */
export function ScanLine({ engine, events, samples, active, restingSource, still, note, outlier, variant = "scan" }: Props) {
  const lineRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const { playing } = useEngineState(engine);
  const sweeping = active && playing;

  useEffect(() => {
    const place = (x: number, from: number, to: number) => {
      if (lineRef.current) lineRef.current.style.left = `${(x * 100).toFixed(3)}%`;
      if (bandRef.current) {
        bandRef.current.style.left = `${(from * 100).toFixed(3)}%`;
        bandRef.current.style.width = `${((to - from) * 100).toFixed(3)}%`;
      }
    };
    if (!sweeping) {
      if (restingSource !== null && samples > 0) {
        place((restingSource + 0.5) / samples, restingSource / samples, (restingSource + 1) / samples);
      }
      return;
    }
    let raf = 0;
    const tick = () => {
      const position = engine.position();
      const point = position === null ? null : scanPoint(position, events, samples, still);
      if (point) place(point.x, point.band.from, point.band.to);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine, events, samples, sweeping, restingSource, still]);

  if (!sweeping && restingSource === null) return null;
  if (variant === "cursor") return <div ref={lineRef} className="strip-cursor" aria-hidden="true" />;
  return (
    <>
      <div ref={bandRef} className="scan-band" aria-hidden="true" />
      <div ref={lineRef} className={outlier ? "playhead hot" : "playhead"} aria-hidden="true">
        {note && (
          <span className="playhead-note">
            <b>{note.note}</b>
            <small>{note.hz}</small>
          </span>
        )}
      </div>
    </>
  );
}
