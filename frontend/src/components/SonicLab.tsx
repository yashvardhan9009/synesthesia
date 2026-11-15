import { useEffect, useMemo, useRef, useState } from "react";
import { listArchive, removeFromArchive, saveToArchive, type ArchiveEntry } from "../audio/archive.ts";
import type { SonificationEngine } from "../audio/engine.ts";
import {
  DEFAULT_CONFIG,
  LOCKED_KEYS,
  decodeConfig,
  encodeConfig,
  SCIENTIFIC_LOCK,
  deleteNamedConfig,
  effectiveConfig,
  listSavedConfigs,
  loadCurrentConfig,
  rootMidi,
  sanitizeConfig,
  saveCurrentConfig,
  saveNamedConfig,
  scaleSteps,
  toSonicSettings,
  type LabConfig,
  type LabMode,
} from "../audio/labConfig.ts";
import { MAPPINGS, POWER_VARIABLES, type LayerId } from "../audio/mappings.ts";
import { downloadPostcard, renderPostcard } from "../audio/postcard.ts";
import { buildSoundscape, soundingLayers, type Soundscape, type SoundStep } from "../audio/soundscape.ts";
import { defaultSoundscapeMonth, latestCompleteMonth, monthWindow } from "../audio/window.ts";
import { midiName } from "../science/score.ts";
import type { LeadParameter, PitchFrom, PowerSeries, SonicSettings } from "../types.ts";
import { PARAMETERS, PLACES } from "../types.ts";
import { useEngineState } from "../ui/audioBus.ts";
import { ArchiveShelf } from "./lab/ArchiveShelf.tsx";
import { ConfigShelf, type Slot } from "./lab/ConfigShelf.tsx";
import { Choice, Segmented } from "./lab/controls.tsx";
import { LabTransport } from "./lab/LabTransport.tsx";
import { DayStrip } from "./lab/DayStrip.tsx";
import { LayerMixer } from "./lab/LayerMixer.tsx";
import { MappingControls } from "./lab/MappingControls.tsx";
import { MappingTable } from "./lab/MappingTable.tsx";
import { TracePanel } from "./lab/TracePanel.tsx";
import { usePowerWindow } from "./lab/usePowerWindow.ts";
import { browserStore } from "../storage.ts";
import "./lab/lab.css";

const LEADS = Object.keys(PARAMETERS) as LeadParameter[];
const MODES: { value: LabMode; label: string }[] = [
  { value: "scientific", label: "Scientific" },
  { value: "artistic", label: "Artistic" },
];

/** A Lab link: ?lab=<encoded config>&place=<index>&month=YYYY-MM. */
function readSharedLab(): { config: LabConfig | null; place: number | null; month: string | null } {
  const params = new URLSearchParams(window.location.search);
  const config = params.get("lab") !== null ? decodeConfig(params.get("lab") ?? "") : null;
  const place = Number(params.get("place"));
  const month = params.get("month");
  return {
    config,
    place: Number.isInteger(place) && place >= 0 && place < PLACES.length && params.has("place") ? place : null,
    month: month && monthWindow(month) ? month : null,
  };
}

/** Mapping fields only: mix changes are applied live without rebuilding the soundscape. */
function mappingKey(config: LabConfig): string {
  const { layers: _layers, ...rest } = effectiveConfig(config);
  void _layers;
  return JSON.stringify(rest);
}

type Props = {
  settings: SonicSettings;
  onChange: (settings: SonicSettings) => void;
  engine: SonificationEngine;
  onCaption: (caption: string) => void;
};

type Loaded = { series: PowerSeries; place: string; title: string };

export function SonicLab({ settings, onChange, engine, onCaption }: Props) {
  const store = useMemo(browserStore, []);
  const shared = useMemo(readSharedLab, []);
  const [config, setConfig] = useState<LabConfig>(() => shared.config ?? loadCurrentConfig(store));
  const [saved, setSaved] = useState(() => listSavedConfigs(store));
  const [archive, setArchive] = useState<ArchiveEntry[]>(() => listArchive(store));
  const [slots, setSlots] = useState<Record<Slot, LabConfig | null>>({ A: null, B: null });
  const [placeIndex, setPlaceIndex] = useState(shared.place ?? 0);
  const [month, setMonth] = useState(() => shared.month ?? defaultSoundscapeMonth(new Date()));
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [heartbeat, setHeartbeat] = useState(false);
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [current, setCurrent] = useState<SoundStep | null>(null);
  const [playingSlot, setPlayingSlot] = useState<Slot | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const engineState = useEngineState(engine);
  const labPlaying = engineState.playing && (engineState.source ?? "").startsWith("lab");

  const place = PLACES[placeIndex];
  const power = usePowerWindow(loaded ? null : { lat: place.lat, lon: place.lon, month });
  const series = loaded?.series ?? power.data;
  const placeName = loaded?.place ?? place.name;
  const effective = effectiveConfig(config);
  const locked = config.mode === "scientific";
  const key = mappingKey(config);

  // Rebuild only when the data or a mapping parameter changes.
  const scape = useMemo(
    () => (series ? buildSoundscape(series, config, placeName) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, placeName, key],
  );

  useEffect(() => {
    saveCurrentConfig(store, config);
  }, [store, config]);

  useEffect(() => {
    engine.setLayerMix(config.layers);
  }, [engine, config.layers]);

  useEffect(() => {
    if (!engineState.playing) {
      setPlayingSlot(null);
    }
  }, [engineState.playing]);

  const play = (target: Soundscape, from = 0, slot: Slot | null = null, loop = heartbeat) => {
    engine.setLayerMix(target.config.layers);
    setPlayingSlot(slot);
    void engine
      .playSoundscape(target, {
        source: slot ? `lab-${slot}` : "lab",
        loop,
        heartbeat: loop,
        startAt: from,
        onStep: (step, index) => {
          setStepIndex(index);
          setCurrent(step);
          onCaption(step.caption);
        },
        onEnded: () => {
          setPlayingSlot(null);
        },
      })
      .catch((error: Error) => {
        onCaption(error.message);
      });
  };

  // A mapping change while the Lab is playing continues from the current day with the new rule.
  const lastScape = useRef<Soundscape | null>(null);
  useEffect(() => {
    const previous = lastScape.current;
    lastScape.current = scape;
    if (!scape || !previous || previous === scape || !labPlaying || playingSlot) return;
    play(scape, ((stepIndex ?? -1) + 1) % scape.steps.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scape]);

  const stop = () => {
    engine.stopAll();
    setPlayingSlot(null);
  };

  const update = (next: LabConfig) => {
    setConfig(next);
    onChange(toSonicSettings(next, settings));
  };
  const patch = (changes: Partial<LabConfig>) => update(sanitizeConfig({ ...config, ...changes }));

  const setMode = (mode: LabMode) => {
    patch({ mode });
    setStatus(
      mode === "scientific"
        ? "Scientific Mode. Every mapping is fixed to the published reference, so this data always sounds the same."
        : "Artistic Mode. Instrument, scale, range, tempo and response are yours to change.",
    );
  };

  const toggleHeartbeat = () => {
    const next = !heartbeat;
    setHeartbeat(next);
    if (scape && (labPlaying || next)) play(scape, labPlaying ? ((stepIndex ?? -1) + 1) % scape.steps.length : 0, null, next);
  };

  const playSlot = (slot: Slot) => {
    const slotConfig = slots[slot];
    if (!series || !slotConfig) return;
    if (playingSlot === slot) {
      stop();
      return;
    }
    const target = buildSoundscape(series, slotConfig, placeName);
    onCaption(`Configuration ${slot}, ${slotConfig.mode === "scientific" ? "Scientific" : "Artistic"}, on ${target.title}.`);
    play(target, 0, slot, false);
  };

  const postcard = async (target: Soundscape, id: string) => {
    setBusy(id);
    setStatus("Rendering the postcard offline…");
    try {
      const card = await renderPostcard(target, { heartbeat, volume: engineState.volume });
      downloadPostcard(card);
      setStatus(`Postcard ready: ${card.fileName}, ${card.seconds.toFixed(1)} s, ${card.steps} days of NASA POWER data.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The postcard could not be rendered.");
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({ lab: encodeConfig(config), place: String(placeIndex), month }).toString();
    try {
      await navigator.clipboard.writeText(url.toString());
      setStatus("Link copied. It opens the Lab with this place, month and configuration.");
    } catch {
      setStatus(`Copy this link: ${url.toString()}`);
    }
  };

  const saveScape = () => {
    if (!series || !scape) return;
    const result = saveToArchive(store, { title: scape.title, place: placeName, config, series });
    setArchive(result.entries);
    setStatus(result.saved ? `Saved to the Earth Sound Archive: ${scape.title}.` : "This browser would not store the soundscape. Storage may be full or disabled.");
  };

  const playArchived = (entry: ArchiveEntry) => {
    setLoaded({ series: entry.series, place: entry.place, title: entry.title });
    setConfig(entry.config);
    const target = buildSoundscape(entry.series, entry.config, entry.place);
    setStatus(`Loaded from the archive: ${entry.title}.`);
    play(target, 0, null);
  };

  const missing = scape ? POWER_VARIABLES.filter((variable) => scape.missing[variable] > 0) : [];
  const step = labPlaying ? current : null;
  const activeLayers = step ? soundingLayers(step, heartbeat) : new Set<LayerId>();
  const steps = scaleSteps(effective);
  const root = rootMidi(effective);
  const keys = Array.from({ length: effective.span * 12 + 1 }, (_, index) => root + index);

  return (
    <section className="deck lab" aria-label="Sonic Lab">
      <div className="lab-head">
        <header>
          <p className="meta-row">
            <span><span className="label">Data</span><b>NASA POWER daily, six variables</b></span>
            <span><span className="label">Mode</span><b>{locked ? "Scientific, locked" : "Artistic, open"}</b></span>
          </p>
          <h2 className="deck-title">The instrument</h2>
          <p className="reading" style={{ marginTop: 16 }}>
            Six measurements play at once: temperature sets the pitch, rain the rhythm, wind the intensity, humidity the
            texture, pressure the vibrato and cloud the chord. A bell rings when a day is unusual for the window.
          </p>
        </header>
        <div className="mode-switch">
          <span className="label" id="lab-mode-label">Operating mode</span>
          <Segmented label="Operating mode" value={config.mode} options={MODES} onChange={setMode} />
          <p className="muted tiny" id="lab-lock-note">
            {locked
              ? `Scientific locks ${LOCKED_KEYS.length} mapping parameters to the reference: chromatic from ${midiName(SCIENTIFIC_LOCK.tonic)}, ${SCIENTIFIC_LOCK.span} octaves, fixed physical ranges, ${SCIENTIFIC_LOCK.bpm} bpm. Only the mix can change.`
              : "Artistic unlocks the instrument, scale, register, band, tempo and response. The data and the trace stay the same."}
          </p>
        </div>
      </div>

      <div className="lab-source" role="group" aria-label="Data window">
        {loaded ? (
          <div className="fields">
            <p className="tiny"><span className="label">From the archive</span> {loaded.title}</p>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => { stop(); setLoaded(null); }}>Back to live NASA POWER</button>
          </div>
        ) : (
          <form className="fields" onSubmit={(event) => event.preventDefault()}>
            <Choice
              label="Place"
              value={String(placeIndex)}
              options={PLACES.map((item, index) => ({ value: String(index), label: item.name }))}
              onChange={(value) => { stop(); setPlaceIndex(Number(value)); setStepIndex(null); }}
            />
            <label className="field">
              <span className="label">Month</span>
              <input type="month" min="1981-01" max={latestCompleteMonth(new Date())} value={month} onChange={(event) => { stop(); setMonth(event.target.value); setStepIndex(null); }} />
            </label>
            <p className="muted tiny lab-why">{place.why}</p>
          </form>
        )}
        <p className="lab-data-state tiny" aria-live="polite">
          {power.loading && !loaded ? "Asking NASA POWER for six daily variables…" : null}
          {power.error && !loaded ? <span className="alert-text">NASA POWER did not answer: {power.error}</span> : null}
          {scape && !power.loading
            ? missing.length === 0
              ? `${scape.steps.length} days, every variable present.`
              : `${scape.steps.length} days. Missing in POWER: ${missing.map((variable) => `${variable} on ${scape.missing[variable]} day${scape.missing[variable] === 1 ? "" : "s"}`).join(", ")}. Those layers are silent on those days.`
            : null}
        </p>
      </div>

      <LabTransport
        engine={engine}
        state={engineState}
        canPlay={!!scape}
        playing={labPlaying && !playingSlot}
        heartbeat={heartbeat}
        rendering={busy === "current"}
        canShare={!loaded}
        onPlay={() => scape && play(scape, 0)}
        onStop={stop}
        onHeartbeat={toggleHeartbeat}
        onPostcard={() => scape && void postcard({ ...scape, config: { ...scape.config, layers: config.layers } }, "current")}
        onArchive={saveScape}
        onShare={() => void share()}
      />
      <p className="lab-status tiny" role="status">{status}</p>

      {scape && <DayStrip scape={scape} current={labPlaying ? stepIndex : null} onPick={(index) => play(scape, index)} />}

      <TracePanel step={step} dataset={scape?.dataset ?? ""} heartbeat={heartbeat} />

      <div>
        <h3 className="lab-section-title"><span className="label">Mixer</span> Adjust each layer. Allowed in both modes: it changes loudness and position, not the mapping.</h3>
        <LayerMixer layers={config.layers} active={activeLayers} onChange={(layers) => update({ ...config, layers })} />
      </div>

      <div>
        <h3 className="lab-section-title">
          <span className="label">Mapping</span> {locked ? "Locked by Scientific Mode. Switch to Artistic to change." : "How the numbers become notes."}
        </h3>
        <div className="keyboard" role="img" aria-label={`${effective.scale} scale from ${midiName(root)} across ${effective.span} octave${effective.span === 1 ? "" : "s"}. Notes in the scale are marked${step?.lead ? `. Now sounding ${step.lead.name}` : ""}.`}>
          {keys.map((midi) => {
            const degree = (midi - root) % 12;
            const sharp = [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
            const cls = ["key-cell", sharp ? "sharp" : "", steps.includes(degree) ? "in-scale" : "", degree === 0 ? "tonic" : "", step?.lead?.midi === midi ? "lit" : ""].join(" ");
            return <span key={midi} className={cls}>{midiName(midi)}</span>;
          })}
        </div>
        <MappingControls config={effective} locked={locked} onChange={patch} />
      </div>

      <ConfigShelf
        config={config}
        saved={saved}
        slots={slots}
        playingSlot={playingSlot}
        canPlay={!!series}
        onApply={(next, label) => { update(sanitizeConfig(next)); setStatus(`Applied ${label}.`); }}
        onSave={(name) => { setSaved(saveNamedConfig(store, name, config)); setStatus(`Saved “${name.trim() || "Untitled"}” on this device.`); }}
        onDelete={(name) => setSaved(deleteNamedConfig(store, name))}
        onReset={() => { update(DEFAULT_CONFIG); setStatus("Reset to the Scientific reference."); }}
        onStore={(slot) => { setSlots((previous) => ({ ...previous, [slot]: config })); setStatus(`Stored the current settings in ${slot}.`); }}
        onPlaySlot={playSlot}
      />

      <div className="lab-columns">
        <section aria-labelledby="lab-archive">
          <h3 id="lab-archive" className="lab-section-title"><span className="label">Earth Sound Archive</span></h3>
          <ArchiveShelf
            entries={archive}
            busy={busy}
            onPlay={playArchived}
            onPostcard={(entry) => void postcard(buildSoundscape(entry.series, entry.config, entry.place), entry.id)}
            onRemove={(entry) => setArchive(removeFromArchive(store, entry.id))}
          />
        </section>
        <section aria-labelledby="lab-routing">
          <h3 id="lab-routing" className="lab-section-title"><span className="label">Other modes</span></h3>
          <div className="fields">
            <Choice
              label="Jukebox pitch"
              value={settings.pitchFrom}
              options={[
                { value: "track", label: "Each frame’s own mapping" },
                { value: "luminance", label: "Brightness" },
                { value: "warmth", label: "Warmth (red − blue)" },
                { value: "contrast", label: "Contrast" },
              ]}
              onChange={(value) => onChange({ ...settings, pitchFrom: value as PitchFrom | "track" })}
            />
            <Choice
              label="Cosmic Earth lead"
              value={settings.lead}
              options={LEADS.map((name) => ({ value: name, label: PARAMETERS[name].label }))}
              onChange={(lead) => onChange({ ...settings, lead })}
            />
          </div>
          <p className="muted tiny">Scale, tonic, range, tempo and anomaly |z| set here also apply to the other modes where they support them.</p>
        </section>
      </div>

      <section aria-labelledby="lab-mappings">
        <h3 id="lab-mappings" className="lab-section-title"><span className="label">What each sound means</span></h3>
        <MappingTable />
        <p className="muted tiny">Variables: {POWER_VARIABLES.map((variable) => `${variable} (${MAPPINGS[variable].unit})`).join(", ")}.</p>
      </section>
    </section>
  );
}
