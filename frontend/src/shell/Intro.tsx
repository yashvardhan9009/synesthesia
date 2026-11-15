import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Pause, Play } from "lucide-react";
import { LogoMark } from "../ui/LogoMark.tsx";
import { INTRO_MS, INTRO_SCENES, sceneAt, sceneStart } from "./introScript.ts";

type Props = {
  still: boolean;
  onDone: () => void;
};

/**
 * A twenty-second introduction. It runs on its own, can be paused, stepped
 * and skipped (Escape), and with reduced motion it does not advance by itself.
 */
export function Intro({ still, onDone }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(still);
  const dialogRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const { index, within, done } = sceneAt(elapsed);
  const scene = INTRO_SCENES[index];

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    skipRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  // Escape skips from anywhere, even before focus has landed in the dialog.
  useEffect(() => {
    const onKey = (key: KeyboardEvent) => {
      if (key.key === "Escape") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  useEffect(() => {
    if (paused || done) return;
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      // Read the delta now: the updater runs later, after `last` has moved on.
      const delta = Math.max(0, now - last);
      last = now;
      setElapsed((value) => Math.min(INTRO_MS, value + delta));
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [paused, done]);

  useEffect(() => {
    if (done && !still) {
      const timer = window.setTimeout(onDone, 600);
      return () => window.clearTimeout(timer);
    }
  }, [done, still, onDone]);

  const go = (next: number) => {
    if (next >= INTRO_SCENES.length) {
      onDone();
      return;
    }
    setElapsed(sceneStart(Math.max(0, next)));
  };

  return (
    <div
      ref={dialogRef}
      className="intro"
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-line"
      aria-describedby="intro-detail"
      data-scene={scene.id}
      onKeyDown={(key) => {
        if (key.key === "ArrowRight") go(index + 1);
        else if (key.key === "ArrowLeft") go(index - 1);
        else if (key.key === "Tab") {
          // Keep focus inside the dialog.
          const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button");
          if (!focusable || focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (key.shiftKey && document.activeElement === first) {
            key.preventDefault();
            last.focus();
          } else if (!key.shiftKey && document.activeElement === last) {
            key.preventDefault();
            first.focus();
          }
        } else return;
        key.stopPropagation();
      }}
    >
      <div className="intro-field" aria-hidden="true">
        <IntroVisual scene={scene.id} within={within} still={still} />
      </div>
      <div className="intro-copy" key={scene.id}>
        <p className="label intro-kicker">
          <span className="num">{String(index + 1).padStart(2, "0")}</span> {scene.kicker}
        </p>
        <h2 id="intro-line" className="intro-line">
          {scene.line}
        </h2>
        <p id="intro-detail" className="intro-detail">
          {scene.detail}
        </p>
      </div>
      <div className="intro-bar">
        <ol className="intro-steps" aria-label="Introduction progress">
          {INTRO_SCENES.map((item, step) => (
            <li key={item.id} aria-current={step === index ? "step" : undefined}>
              <span
                className="intro-step-fill"
                style={{ "--fill": step < index ? 1 : step === index ? within : 0 } as CSSProperties}
              />
              <span className="sr-only">{item.kicker}</span>
            </li>
          ))}
        </ol>
        <div className="intro-actions">
          <button className="dock-icon" onClick={() => setPaused((value) => !value)} aria-label={paused ? "Play the introduction" : "Pause the introduction"}>
            {paused ? <Play size={15} aria-hidden="true" fill="currentColor" /> : <Pause size={15} aria-hidden="true" fill="currentColor" />}
          </button>
          <button className="btn btn-ghost btn-small" onClick={() => go(index + 1)}>
            {index === INTRO_SCENES.length - 1 ? "Begin" : "Next"}
          </button>
          <button ref={skipRef} className="btn btn-primary btn-small" onClick={onDone}>
            Skip introduction
          </button>
        </div>
        <p className="label intro-note">Illustration only. No measurement is shown in this introduction. Esc to skip.</p>
      </div>
    </div>
  );
}

/** One quiet drawing per scene: a line that becomes a waveform, bars becoming notes, a flagged spike, a trace. */
function IntroVisual({ scene, within, still }: { scene: string; within: number; still: boolean }) {
  const t = still ? 1 : within;
  if (scene === "listen" || scene === "sources") {
    return (
      <svg viewBox="0 0 400 400" className="intro-svg">
        <circle cx="200" cy="200" r="120" className="intro-planet" />
        <circle cx="200" cy="200" r="150" className="intro-orbit" strokeDasharray={`${942 * (scene === "listen" ? t : 1)} 942`} />
        {scene === "sources" &&
          [0, 1, 2, 3, 4, 5, 6, 7, 8].map((dot) => {
            const angle = (dot / 9) * Math.PI * 2 - Math.PI / 2;
            const shown = t * 9 > dot;
            return <circle key={dot} cx={200 + Math.cos(angle) * 150} cy={200 + Math.sin(angle) * 150} r={shown ? 5 : 0} className="intro-dot" />;
          })}
        <LogoInSvg />
      </svg>
    );
  }
  const heights = [0.3, 0.42, 0.38, 0.55, 0.5, 0.62, 0.58, 0.95, 0.6, 0.66, 0.7, 0.64];
  return (
    <svg viewBox="0 0 400 400" className="intro-svg">
      {heights.map((height, bar) => {
        const lit = t * heights.length > bar;
        const spike = scene !== "mapping" && bar === 7;
        return (
          <g key={bar}>
            <rect
              x={40 + bar * 28}
              y={320 - height * 220}
              width={16}
              height={height * 220}
              className={spike ? "intro-bar-heat" : lit ? "intro-bar-lit" : "intro-bar-off"}
            />
            {scene === "mapping" && lit && <circle cx={48 + bar * 28} cy={300 - height * 220 - 14} r={4} className="intro-dot" />}
          </g>
        );
      })}
      {scene === "trace" && (
        <path d={`M 244 ${320 - 0.95 * 220} V 360 H 380`} className="intro-trace" strokeDasharray={`${400 * t} 400`} />
      )}
      <line x1="30" y1="320" x2="380" y2="320" className="intro-orbit" />
    </svg>
  );
}

function LogoInSvg() {
  return (
    <g transform="translate(152 152) scale(3)">
      <LogoMark size={32} />
    </g>
  );
}
