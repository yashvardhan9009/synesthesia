import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, Play, Radar } from "lucide-react";
import type { View } from "../shell/route.ts";
import type { BlueMarbleSample } from "../audio/touch.ts";
import { HeroEarth } from "./HeroEarth.tsx";

type Props = {
  still: boolean;
  onEnter: (view: View, autoplay?: boolean) => void;
  onTouch: (sample: BlueMarbleSample | null) => void;
  onboarding?: ReactNode;
};

/** The three experiences; Earth Listening Intelligence is the bridge that joins them for one region. */
const EXPERIENCES: { title: string; text: string; href: string; label: string; joins: string }[] = [
  { title: "Hear Earth", text: "Touch the Blue Marble or a point on Cosmic Earth and hear its NASA POWER measurements as one soundscape.", href: "#/cosmic", label: "Cosmic Earth · Blue Marble · Sound Map", joins: "hears the region" },
  { title: "Travel through environmental history", text: "Play a place's record from 1981, one note per month or season, against its 2001–2020 normal.", href: "#/timeline", label: "Sound Timeline · Time Machine", joins: "plays its history" },
  { title: "Discover global anomalies through sound", text: "Scan 48 points around the globe, hear the outliers ring, and open the measurements behind each bell.", href: "#/cosmic?focus=anomaly", label: "Global Anomaly Explorer", joins: "finds its anomalies" },
];

export function Landing({ still, onEnter, onTouch, onboarding }: Props) {
  return (
    <section className="landing landing-focus" aria-labelledby="hero-title">
      <div className="hero">
        <div className="hero-copy">
          <p className="eyebrow reveal" style={{ "--i": 0 } as CSSProperties}>
            <span className="label">NASA Space Apps 2026</span><span className="rule-dash" aria-hidden="true" /><span className="label">The Earth Information Jukebox</span>
          </p>
          <h1 id="hero-title" className="hero-title reveal" style={{ "--i": 1 } as CSSProperties}>Earth,<br /><em>heard.</em></h1>
          <p className="hero-lede reveal" style={{ "--i": 2 } as CSSProperties}>
            Hear patterns in NASA’s real environmental measurements. Temperature, rain, wind and humidity become one traceable soundscape.
          </p>
          <div className="hero-actions reveal" style={{ "--i": 3 } as CSSProperties}>
            <a className="btn btn-primary" href="#/listen?region=indian-ocean" onClick={() => onEnter("listen", true)}>
              <Play size={18} aria-hidden="true" strokeWidth={2} />Try the Indian Ocean<ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
          <p className="hero-hint reveal" style={{ "--i": 4 } as CSSProperties}>Plays the region straight away: a decade of NASA POWER months in under a minute, with what was unusual found and explained from the measurements.</p>
          {onboarding && <div className="reveal" style={{ "--i": 5 } as CSSProperties}>{onboarding}</div>}
        </div>
        <div className="hero-visual reveal" style={{ "--i": 2 } as CSSProperties}><HeroEarth still={still} onTouch={onTouch} /></div>
      </div>
      <section className="experiences" aria-labelledby="experiences-title">
        <h2 id="experiences-title" className="label">Three ways to listen</h2>
        <div className="experience-grid">
          {EXPERIENCES.map((item, index) => (
            <article className="experience-card" key={item.title}>
              <p className="label">0{index + 1} · {item.label}</p>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <a href={item.href}>Open <span className="sr-only">{item.title}</span><ArrowRight size={15} aria-hidden="true" /></a>
            </article>
          ))}
        </div>
        <a className="bridge" href="#/listen?region=indian-ocean">
          <span className="bridge-mark" aria-hidden="true"><Radar size={22} strokeWidth={1.5} /></span>
          <span className="bridge-copy">
            <span className="label">The bridge · Earth Listening Intelligence</span>
            <b>Pick a region and all three meet.</b>
            <span>
              It {EXPERIENCES.map((item) => item.joins).join(", ").replace(/, ([^,]*)$/, " and $1")}: unusual temperature, rainfall changes, unusual wind and historical deviations, each
              explained in sentences computed from the measurements, each one click from its moment in the sound.
            </span>
          </span>
          <ArrowRight className="bridge-arrow" size={20} aria-hidden="true" />
        </a>
      </section>
      <section className="evidence-links" aria-label="Evidence">
        <a className="evidence-card" href="#/case">
          <span className="label">Case study</span>
          <b>Four charts, or one sound?</b>
          <span>The record is searched for its strongest compound heat-and-dryness event. Hear a normal year, hear the event, then reveal the charts.</span>
        </a>
        <a className="evidence-card" href="#/test">
          <span className="label">Listening Test</span>
          <b>Can you hear an anomaly?</b>
          <span>Twelve pairs of real NASA POWER clips, ear only. Which one is unusual? A protocol for a real perception study.</span>
        </a>
      </section>
    </section>
  );
}
