import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Contrast, Waves } from "lucide-react";
import { blueMarbleTouch } from "./audio/touch.ts";
import { AudioDock } from "./shell/AudioDock.tsx";
import { Intro } from "./shell/Intro.tsx";
import { MoreMenu } from "./shell/MoreMenu.tsx";
import { rememberIntroSeen, shouldShowIntro } from "./shell/introScript.ts";
import { Onboarding } from "./shell/Onboarding.tsx";
import { loadProgress, markStep, saveProgress, type Progress, type StepId } from "./shell/onboarding.ts";
import { isTypingTarget } from "./shell/keys.ts";
import { initialView, parseView, viewHash, type View } from "./shell/route.ts";
import { DEFAULT_SETTINGS, type SonicSettings } from "./types.ts";
import { AudioBus, AudioBusContext, TappedEngine, useEngineState } from "./ui/audioBus.ts";
import { LevelMeter } from "./ui/Scope.tsx";
import { LogoMark } from "./ui/LogoMark.tsx";

const Landing = lazy(() => import("./ui/Landing.tsx").then((module) => ({ default: module.Landing })));
const Jukebox = lazy(() => import("./components/Jukebox.tsx").then((module) => ({ default: module.Jukebox })));
const CosmicEarth = lazy(() => import("./components/CosmicEarth.tsx").then((module) => ({ default: module.CosmicEarth })));
const TimeMachine = lazy(() => import("./components/TimeMachine.tsx").then((module) => ({ default: module.TimeMachine })));
const SonicLab = lazy(() => import("./components/SonicLab.tsx").then((module) => ({ default: module.SonicLab })));
const SoundTimeline = lazy(() => import("./components/SoundTimeline.tsx").then((module) => ({ default: module.SoundTimeline })));
const EarthSoundMap = lazy(() => import("./components/EarthSoundMap.tsx").then((module) => ({ default: module.EarthSoundMap })));
const ListeningIntelligence = lazy(() => import("./intelligence/ListeningIntelligence.tsx").then((module) => ({ default: module.ListeningIntelligence })));
const CaseStudy = lazy(() => import("./intelligence/CaseStudy.tsx").then((module) => ({ default: module.CaseStudy })));
const ListeningTest = lazy(() => import("./validation/ListeningTest.tsx").then((module) => ({ default: module.ListeningTest })));
const Methodology = lazy(() => import("./science-page/Methodology.tsx").then((module) => ({ default: module.Methodology })));

const TABS: { view: Exclude<View, "home">; index: string; name: string; href?: string }[] = [
  { view: "listen", index: "00", name: "Listen", href: "#/listen?region=indian-ocean" },
  { view: "cosmic", index: "01", name: "Hear Earth" },
  { view: "timeline", index: "02", name: "History" },
  { view: "cosmic", index: "03", name: "Anomalies", href: "#/cosmic?focus=anomaly" },
];

/** The More menu: the evidence first, then the supporting instruments. */
const MORE_LINKS: { view: Exclude<View, "home">; name: string; hint: string; href?: string; anchor?: string; divider?: boolean }[] = [
  { view: "case", name: "Case study", hint: "4 charts vs 1 sound" },
  { view: "test", name: "Listening Test", hint: "Ear only" },
  { view: "science", name: "Science", hint: "Methods" },
  { view: "soundmap", name: "Sound Map", hint: "Hear Earth", divider: true },
  { view: "time", name: "Time Machine", hint: "History" },
  { view: "cosmic", name: "Sound Battle", hint: "Compare", href: "#/cosmic?focus=battle", anchor: "battle" },
  { view: "jukebox", name: "Jukebox", hint: "EIC frames" },
  { view: "lab", name: "Sonic Lab", hint: "Mapping" },
];

/** In-page targets a link can land on (#/cosmic?focus=anomaly). */
const FOCUS_TARGETS: Record<string, string> = { "global-anomalies": ".anomaly-explorer", battle: ".battle" };

const SECTION_NAMES: Record<string, string> = {
  home: "Blue Marble",
  listen: "Earth Listening Intelligence",
  case: "Case study",
  test: "Listening Test",
  jukebox: "Jukebox",
  cosmic: "Cosmic Earth",
  soundmap: "Earth Sound Map",
  time: "Time Machine",
  timeline: "Environmental Sound Timeline",
  lab: "Sonic Lab",
  science: "Science & Methodology",
};

const VIEW_CAPTIONS: Record<View, string> = {
  home: "SYNESTHESIA. Press and drag across the planet to hear Blue Marble, or choose a mode.",
  listen: "Earth Listening Intelligence. A region's NASA POWER record, heard and explained from the measurements.",
  case: "Case study. One real event, found by ear.",
  test: "Listening Test. Can you hear a significant anomaly? Answer by ear only.",
  jukebox: "Jukebox. Nine EIC frames. Keys 1 through 9 pick a frame.",
  cosmic: "Cosmic Earth. A point on the globe, in NASA POWER numbers.",
  soundmap: "Earth Sound Map. Sweep across the globe and hear each region's NASA POWER day.",
  time: "Time Machine. Two windows of NASA POWER temperature, day by day.",
  timeline: "Environmental Sound Timeline. A place's NASA POWER record against its 2001–2020 normal, one note per step.",
  lab: "Sonic Lab. The scale, the tempo, and which measurement leads. The scale check is not Earth data.",
  science: "Science and Methodology. Every dataset, formula and limitation behind the sound.",
};

/** Sections whose piece can be started from the dock or with Space. */
const STARTABLE = new Set<View>(["jukebox", "cosmic"]);

function anchorOf(hash: string): string | null {
  const parts = hash.replace(/^#\/?/, "").split("/");
  const focus = new URLSearchParams(hash.split("?")[1] ?? "").get("focus");
  if (focus === "anomaly") return "global-anomalies";
  if (focus === "battle") return "battle";
  return parts[0] === "science" && parts[1] ? parts[1] : null;
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export default function App() {
  const engine = useMemo(() => new TappedEngine(), []);
  const bus = useMemo(() => new AudioBus(engine), [engine]);
  const playback = useEngineState(engine);
  const [view, setView] = useState<View>(() => initialView(window.location.hash, window.location.search));
  const [anchor, setAnchor] = useState<string | null>(() => anchorOf(window.location.hash));
  const [settings, setSettings] = useState<SonicSettings>(DEFAULT_SETTINGS);
  const [caption, setCaption] = useState(
    "SYNESTHESIA is ready. Press and drag across the planet, or open the Jukebox and press play.",
  );
  const [announcement, setAnnouncement] = useState("");
  const [active, setActive] = useState<Record<string, number | null>>({});
  const [plays, setPlays] = useState<Record<string, number>>({});
  const [selectedTrack, setSelectedTrack] = useState(5313);
  const [autoPlay, setAutoPlay] = useState(false);
  const [contrast, setContrast] = useState(() => safeStorage()?.getItem("synesthesia.contrast") === "1");
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches || safeStorage()?.getItem("synesthesia.still") === "1",
  );
  const [introOpen, setIntroOpen] = useState(() =>
    shouldShowIntro(window.location.search, safeStorage(), navigator.webdriver === true),
  );
  const [progress, setProgress] = useState<Progress>(() => loadProgress(safeStorage()));
  const mainRef = useRef<HTMLElement>(null);
  const firstView = useRef(true);

  const tick = useCallback((step: StepId) => setProgress((current) => markStep(current, step)), []);
  const tickTrace = useCallback(() => tick("trace"), [tick]);

  useEffect(() => saveProgress(safeStorage(), progress), [progress]);

  useEffect(() => {
    document.documentElement.classList.toggle("contrast", contrast);
    document.documentElement.classList.toggle("still", reducedMotion);
    bus.slow = reducedMotion;
    safeStorage()?.setItem("synesthesia.contrast", contrast ? "1" : "0");
    safeStorage()?.setItem("synesthesia.still", reducedMotion ? "1" : "0");
  }, [bus, contrast, reducedMotion]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => media.matches && setReducedMotion(true);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("sounding", playback.playing || playback.touch !== null);
  }, [playback.playing, playback.touch]);

  // The URL hash is the route, so Back, reload and shared links land on the same page.
  useEffect(() => {
    const onHash = () => {
      setView(parseView(window.location.hash));
      setAnchor(anchorOf(window.location.hash));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    const name = SECTION_NAMES[view];
    setAnnouncement(`${name} opened.${playback.playing ? ` ${SECTION_NAMES[playback.source ?? ""] ?? "The sound"} keeps playing.` : ""}`);
    if (!playback.playing) setCaption(VIEW_CAPTIONS[view]);
    if (view === "science") tick("science");
    if (!anchor) {
      window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
      mainRef.current?.focus({ preventScroll: true });
    }
    // Only a change of page should announce and move focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Land squarely on an in-page section (the global anomaly explorer, the battle): wait until it renders, then scroll it under the header and focus it once.
  const [landing, setLanding] = useState(0);
  useEffect(() => {
    const selector = anchor ? FOCUS_TARGETS[anchor] : undefined;
    if (!selector) return;
    let attempts = 0;
    let timer = 0;
    let observer: ResizeObserver | null = null;
    let settle = 0;
    const scrollTo = (target: HTMLElement) => {
      const header = document.querySelector<HTMLElement>(".console");
      const offset = header && getComputedStyle(header).position === "sticky" ? header.offsetHeight : 0;
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset - 12, behavior: "auto" });
    };
    // The page above the target keeps growing while its data arrives; follow it until the user takes over or it settles.
    const stop = () => {
      observer?.disconnect();
      observer = null;
      window.clearTimeout(settle);
      for (const type of ["wheel", "touchstart", "keydown", "pointerdown"]) window.removeEventListener(type, stop);
    };
    const land = () => {
      const target = document.querySelector<HTMLElement>(selector);
      if (!target) {
        if (attempts++ < 80) timer = window.setTimeout(land, 100);
        return;
      }
      scrollTo(target);
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      observer = new ResizeObserver(() => scrollTo(target));
      observer.observe(document.body);
      settle = window.setTimeout(stop, 4000);
      for (const type of ["wheel", "touchstart", "keydown", "pointerdown"]) window.addEventListener(type, stop, { passive: true });
    };
    timer = window.setTimeout(land, 150);
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, [anchor, view, landing]);

  useEffect(() => {
    if (playback.playing) tick("play");
  }, [playback.playing, tick]);

  const requestPlay = useCallback((section: View) => {
    setPlays((current) => ({ ...current, [section]: (current[section] ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (introOpen || event.key !== " " || isTypingTarget(event.target)) return;
      const target = event.target as HTMLElement | null;
      const role = target?.getAttribute("role");
      if (role === "application" || role === "slider") return;
      const tag = target?.tagName;
      if (tag === "BUTTON" || tag === "A" || tag === "SUMMARY") return;
      event.preventDefault();
      if (playback.playing) engine.pause();
      else if (playback.length > 0 && (playback.source === view || !STARTABLE.has(view))) void engine.resume();
      else if (STARTABLE.has(view)) requestPlay(view);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine, introOpen, playback.playing, playback.length, playback.source, requestPlay, view]);

  useEffect(() => () => engine.stopAll(), [engine]);

  const go = useCallback((next: View) => {
    const hash = viewHash(next);
    if (window.location.hash === hash) {
      window.scrollTo({ top: 0 });
      return;
    }
    window.location.hash = hash;
  }, []);

  const enter = (mode: View, autoplay = false) => {
    // Start audio inside the click, so the browser allows it once the frame arrives.
    void engine.ensure();
    setAutoPlay(autoplay);
    if (mode === "listen") window.location.hash = "#/listen?region=indian-ocean";
    else go(mode);
  };

  const indexSetters = useMemo(() => {
    const make = (section: string) => (index: number | null) =>
      setActive((current) => (current[section] === index ? current : { ...current, [section]: index }));
    return { jukebox: make("jukebox"), cosmic: make("cosmic") };
  }, []);

  const playingIn = (section: View) => playback.playing && playback.source === section;
  const closeIntro = useCallback(() => {
    rememberIntroSeen(safeStorage());
    setIntroOpen(false);
  }, []);
  const onStart = STARTABLE.has(view) ? () => requestPlay(view) : view === "home" ? () => enter("jukebox", true) : null;

  return (
    <AudioBusContext.Provider value={bus}>
      <LevelMeter still={reducedMotion} />
      <a className="skip" href="#main" onClick={(event) => { event.preventDefault(); mainRef.current?.focus(); }}>
        Skip to the content
      </a>
      <header className="console">
        <button className="brand" onClick={() => go("home")} aria-label="SYNESTHESIA, Earth heard. Back to the start.">
          <LogoMark />
          <span className="brand-word">SYNESTHESIA</span>
          <span className="brand-tag">Earth, heard</span>
        </button>
        <nav className="modes" aria-label="Primary sections">
          {TABS.map((tab) => (
            <a
              key={`${tab.name}-${tab.view}`}
              className="mode-tab"
              href={tab.href ?? viewHash(tab.view)}
              aria-current={view === tab.view && (tab.name === "Anomalies" ? anchor === "global-anomalies" : !(tab.view === "cosmic" && anchor !== null)) ? "page" : undefined}
              onClick={() => {
                setAutoPlay(false);
                // Clicking the link of the page already open still lands on its section.
                if (tab.href && window.location.hash === tab.href) setLanding((value) => value + 1);
              }}
            >
              <span className="num" aria-hidden="true">{tab.index}</span>
              {tab.name}
              {playingIn(tab.view) && <span className="tab-live" aria-label=", playing" />}
            </a>
          ))}
          <MoreMenu
            links={MORE_LINKS.map((link) => ({
              href: link.href ?? viewHash(link.view),
              name: link.name,
              hint: link.hint,
              divider: link.divider,
              current: view === link.view && (link.view !== "cosmic" || anchor === link.anchor),
            }))}
          />
        </nav>
        <div className="console-right">
          <span className="lamp" aria-hidden="true">
            <span className="lamp-dot" />
            <span className="label lamp-label">Output</span>
          </span>
          <button className="switch" aria-pressed={contrast} onClick={() => setContrast((value) => !value)}>
            <Contrast size={15} aria-hidden="true" strokeWidth={1.75} />
            <span className="switch-text">High contrast</span>
          </button>
          <button className="switch" aria-pressed={reducedMotion} onClick={() => setReducedMotion((value) => !value)}>
            <Waves size={15} aria-hidden="true" strokeWidth={1.75} />
            <span className="switch-text">Reduce motion</span>
          </button>
        </div>
      </header>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <main id="main" ref={mainRef} tabIndex={-1} key={view} className={`view view-${view}`} aria-label={SECTION_NAMES[view]}>
        <Suspense fallback={<div className="section-loading" role="status">Loading section…</div>}>
        {view === "home" && (
          <Landing
            still={reducedMotion}
            onEnter={enter}
            onboarding={
              <Onboarding
                progress={progress}
                onDismiss={() => setProgress((current) => ({ ...current, dismissed: true }))}
                onReplayIntro={() => setIntroOpen(true)}
                onOpenScience={() => go("science")}
              />
            }
            onTouch={(sample) => {
              if (!sample) {
                engine.releaseTouch();
                return;
              }
              tick("touch");
              const { note, caption } = blueMarbleTouch(sample, settings);
              setCaption(caption);
              if (note) void engine.ensure().then(() => engine.touch(note));
            }}
          />
        )}
        {view === "jukebox" && (
          <Jukebox
            settings={settings}
            engine={engine}
            onCaption={setCaption}
            activeIndex={active.jukebox ?? null}
            onActiveIndex={indexSetters.jukebox}
            requestPlay={plays.jukebox ?? 0}
            selected={selectedTrack}
            onSelect={setSelectedTrack}
            reducedMotion={reducedMotion}
            autoPlay={autoPlay}
            onAutoPlayed={() => setAutoPlay(false)}
            onPlayed={() => tick("play")}
          />
        )}
        {view === "cosmic" && (
          <CosmicEarth
            settings={settings}
            engine={engine}
            onCaption={setCaption}
            activeIndex={active.cosmic ?? null}
            onActiveIndex={indexSetters.cosmic}
            requestPlay={plays.cosmic ?? 0}
            reducedMotion={reducedMotion}
            focus={anchor}
          />
        )}
        {view === "time" && (
          <TimeMachine
            settings={settings}
            engine={engine}
            onCaption={setCaption}
          />
        )}
        {view === "listen" && <ListeningIntelligence engine={engine} onCaption={setCaption} autoPlay={autoPlay} onAutoPlayed={() => setAutoPlay(false)} />}
        {view === "case" && <CaseStudy engine={engine} onCaption={setCaption} />}
        {view === "test" && <ListeningTest engine={engine} onCaption={setCaption} />}
        {view === "soundmap" && <EarthSoundMap engine={engine} onCaption={setCaption} />}
        {view === "timeline" && <SoundTimeline engine={engine} onCaption={setCaption} />}
        {view === "lab" && (
          <SonicLab
            settings={settings}
            onChange={setSettings}
            engine={engine}
            onCaption={setCaption}
          />
        )}
        {view === "science" && <Methodology settings={settings} anchor={anchor} />}
        </Suspense>
      </main>

      <footer className="colophon">
        <div className="colophon-grid">
          <div>
            <p>
              Not an official NASA product. Frames are the nine visualizations named on the 2026 NASA Space Apps “Earth
              Information Jukebox” resources tab, hosted by the Scientific Visualization Studio Earth Information Center
              gallery. Cosmic Earth uses NASA POWER daily data and a NASA GIBS Blue Marble image. Missing POWER values
              (−999) are shown as missing, never replaced.
            </p>
            <p className="colophon-links">
              <a href={viewHash("science")}>Science &amp; Methodology</a>
              <a href="#/science/attribution">Attribution</a>
              <button className="link-button" onClick={() => setIntroOpen(true)}>
                Replay the introduction
              </button>
            </p>
          </div>
          <dl className="keys">
            <div>
              <dt><kbd>Space</kbd></dt>
              <dd>Play and pause, when focus is not in a control</dd>
            </div>
            <div>
              <dt><kbd>,</kbd><kbd>.</kbd></dt>
              <dd>Previous and next note</dd>
            </div>
            <div>
              <dt><kbd>M</kbd> <kbd>T</kbd></dt>
              <dd>Mute; open the trace of the sounding note</dd>
            </div>
            <div>
              <dt><kbd>1</kbd>–<kbd>9</kbd></dt>
              <dd>Pick a jukebox frame</dd>
            </div>
            <div>
              <dt><kbd>←</kbd><kbd>→</kbd></dt>
              <dd>Play a picture or the landing globe step by step; rotate the Cosmic Earth globe</dd>
            </div>
          </dl>
        </div>
      </footer>

      <AudioDock
        engine={engine}
        caption={caption}
        sections={SECTION_NAMES}
        onStart={onStart}
        onTraceOpened={tickTrace}
      />

      {introOpen && <Intro still={reducedMotion} onDone={closeIntro} />}
    </AudioBusContext.Provider>
  );
}
