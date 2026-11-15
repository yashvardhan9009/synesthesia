import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useAudioFrame } from "./audioBus.ts";

import type { BlueMarbleSample } from "../audio/touch.ts";
import { HERO_CANVAS_SIZE as CSS_SIZE, HERO_GLOBE_RADIUS as RADIUS, stepHeroHand } from "./heroHand.ts";

type Props = {
  still: boolean;
  onTouch: (sample: BlueMarbleSample | null) => void;
};

const TILT = (16 * Math.PI) / 180;
const RENDER_SCALE = 0.75;

type Lookup = {
  size: number;
  radius: number;
  inside: Uint8Array;
  lon: Float32Array;
  row: Float32Array;
  shade: Float32Array;
  rim: Float32Array;
  grid: Uint8Array;
};

/** Precompute the orthographic projection once; each frame only shifts longitude. */
function buildLookup(size: number, radius: number): Lookup {
  const count = size * size;
  const lookup: Lookup = {
    size,
    radius,
    inside: new Uint8Array(count),
    lon: new Float32Array(count),
    row: new Float32Array(count),
    shade: new Float32Array(count),
    rim: new Float32Array(count),
    grid: new Uint8Array(count),
  };
  const lx = -0.62;
  const ly = 0.42;
  const lz = 0.66;
  const ll = Math.hypot(lx, ly, lz);
  const cos = Math.cos(TILT);
  const sin = Math.sin(TILT);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5 - size / 2) / radius;
      const ny = (y + 0.5 - size / 2) / radius;
      const r2 = nx * nx + ny * ny;
      const index = y * size + x;
      if (r2 > 1) continue;
      const nz = Math.sqrt(1 - r2);
      const y2 = -ny * cos + nz * sin;
      const z2 = ny * sin + nz * cos;
      const lat = Math.asin(Math.max(-1, Math.min(1, y2)));
      const lon = Math.atan2(nx, z2);
      lookup.inside[index] = 1;
      lookup.lon[index] = lon;
      lookup.row[index] = (Math.PI / 2 - lat) / Math.PI;
      const light = (nx * lx + -ny * ly + nz * lz) / ll;
      const day = Math.min(1, Math.max(0, (light + 0.12) / 0.5));
      lookup.shade[index] = 0.1 + 0.95 * day * day * (3 - 2 * day);
      lookup.rim[index] = Math.pow(1 - nz, 3);
      const latDeg = (lat * 180) / Math.PI;
      lookup.grid[index] = Math.abs(latDeg % 30) < 0.35 ? 1 : 0;
    }
  }
  return lookup;
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function HeroEarth({ still, onTouch }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textureRef = useRef<ImageData | null>(null);
  const lookupRef = useRef<Lookup | null>(null);
  const rotation = useRef(-1.1);
  const handRef = useRef<{ x: number; y: number } | null>(null);
  const globeImage = useRef<ImageData | null>(null);
  const levelRef = useRef(0);
  const lastDrawRef = useRef(0);
  const [problem, setProblem] = useState<string | null>(null);
  const onTouchRef = useRef(onTouch);
  onTouchRef.current = onTouch;
  const releaseTimer = useRef(0);

  const release = () => {
    window.clearTimeout(releaseTimer.current);
    handRef.current = null;
    onTouchRef.current(null);
  };

  // Keyboard hand: arrows walk a crosshair across the disc, each step sounding
  // the pixel under it; it lets go shortly after the last key.
  const onKey = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === "Escape") {
      release();
      return;
    }
    const point = stepHeroHand(handRef.current, event.key, event.shiftKey);
    if (!point) return;
    event.preventDefault();
    onTouchRef.current(sampleAtCss(point.x, point.y));
    window.clearTimeout(releaseTimer.current);
    releaseTimer.current = window.setTimeout(release, 900);
  };

  useEffect(() => () => window.clearTimeout(releaseTimer.current), []);

  useEffect(() => {
    const photo = new Image();
    photo.onload = () => {
      const scratch = document.createElement("canvas");
      scratch.width = photo.width;
      scratch.height = photo.height;
      const context = scratch.getContext("2d");
      if (!context) return;
      context.drawImage(photo, 0, 0);
      textureRef.current = context.getImageData(0, 0, photo.width, photo.height);
      setProblem(null);
    };
    photo.onerror = () => setProblem("NASA GIBS Blue Marble did not load, so the planet is drawn as an empty sphere.");
    photo.src = "/api/gibs/bluemarble";
  }, []);

  const renderGlobe = () => {
    const ratio = RENDER_SCALE;
    const size = Math.round(RADIUS * 2 * ratio) + 2;
    if (!lookupRef.current || lookupRef.current.size !== size) {
      lookupRef.current = buildLookup(size, RADIUS * ratio);
      globeImage.current = new ImageData(size, size);
    }
    const lookup = lookupRef.current;
    const image = globeImage.current!;
    const pixels = image.data;
    const texture = textureRef.current;
    const rot = rotation.current;
    const twoPi = Math.PI * 2;
    for (let index = 0; index < lookup.inside.length; index += 1) {
      const offset = index * 4;
      if (!lookup.inside[index]) {
        pixels[offset + 3] = 0;
        continue;
      }
      let red = 14;
      let green = 30;
      let blue = 48;
      if (texture) {
        let u = (lookup.lon[index] + rot + Math.PI) / twoPi;
        u -= Math.floor(u);
        const tx = Math.min(texture.width - 1, (u * texture.width) | 0);
        const ty = Math.min(texture.height - 1, (lookup.row[index] * texture.height) | 0);
        const source = (ty * texture.width + tx) * 4;
        red = texture.data[source];
        green = texture.data[source + 1];
        blue = texture.data[source + 2];
      }
      const shade = lookup.shade[index];
      const rim = lookup.rim[index];
      red = red * shade + rim * 30;
      green = green * shade + rim * 120;
      blue = blue * shade + 6 + rim * 150;
      if (lookup.grid[index]) {
        red += 10;
        green += 22;
        blue += 26;
      }
      pixels[offset] = red;
      pixels[offset + 1] = green;
      pixels[offset + 2] = blue;
      pixels[offset + 3] = 255;
    }
    return { image, ratio, size };
  };

  useAudioFrame((frame) => {
    levelRef.current = frame.level;
    const now = performance.now();
    if (now - lastDrawRef.current < 1000 / 30) return;
    lastDrawRef.current = now;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = RENDER_SCALE;
    if (canvas.width !== CSS_SIZE * ratio) {
      canvas.width = CSS_SIZE * ratio;
      canvas.height = CSS_SIZE * ratio;
    }
    if (!still && !handRef.current) rotation.current += 0.0032;
    const { image, size } = renderGlobe();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    const centre = (CSS_SIZE * ratio) / 2;
    context.putImageData(image, Math.round(centre - size / 2), Math.round(centre - size / 2));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const c = CSS_SIZE / 2;
    const signal = cssVar("--signal", "#52d4e6");
    const heat = cssVar("--heat", "#ffb347");
    const line = cssVar("--line-strong", "#2a4053");
    const muted = cssVar("--muted", "#93a6b5");

    // Atmosphere: a thin halo just outside the limb.
    const halo = context.createRadialGradient(c, c, RADIUS - 2, c, c, RADIUS + 26);
    halo.addColorStop(0, "rgba(82, 212, 230, 0.32)");
    halo.addColorStop(0.35, "rgba(82, 212, 230, 0.08)");
    halo.addColorStop(1, "rgba(82, 212, 230, 0)");
    context.fillStyle = halo;
    context.beginPath();
    context.arc(c, c, RADIUS + 26, 0, Math.PI * 2);
    context.arc(c, c, RADIUS - 1, 0, Math.PI * 2, true);
    context.fill();

    // Bezel: degree ticks like a telescope setting circle.
    const inner = RADIUS + 34;
    context.strokeStyle = line;
    context.lineWidth = 1;
    context.beginPath();
    context.arc(c, c, inner, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    for (let degree = 0; degree < 360; degree += 2) {
      const angle = (degree * Math.PI) / 180 - Math.PI / 2;
      const long = degree % 30 === 0 ? 10 : degree % 10 === 0 ? 6 : 3;
      context.moveTo(c + Math.cos(angle) * inner, c + Math.sin(angle) * inner);
      context.lineTo(c + Math.cos(angle) * (inner - long), c + Math.sin(angle) * (inner - long));
    }
    context.stroke();
    context.fillStyle = muted;
    context.font = '500 10px "IBM Plex Mono", monospace';
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (let degree = 0; degree < 360; degree += 30) {
      const angle = (degree * Math.PI) / 180 - Math.PI / 2;
      context.fillText(String(degree).padStart(3, "0"), c + Math.cos(angle) * (inner + 14), c + Math.sin(angle) * (inner + 14));
    }

    // Spectrum ring: the live output, mirrored left and right. Flat dots in silence.
    const spectrum = frame.spectrum;
    const bars = 96;
    const base = inner + 30;
    const usable = Math.max(16, Math.floor(spectrum.length * 0.28));
    context.lineCap = "round";
    for (let bar = 0; bar < bars; bar += 1) {
      const half = bar < bars / 2 ? bar : bars - 1 - bar;
      const from = Math.floor(Math.pow(usable, half / (bars / 2)));
      const to = Math.max(from + 1, Math.floor(Math.pow(usable, (half + 1) / (bars / 2))));
      let peak = 0;
      for (let index = from; index < to && index < spectrum.length; index += 1) peak = Math.max(peak, spectrum[index]);
      const value = peak / 255;
      const angle = (bar / bars) * Math.PI * 2 - Math.PI / 2;
      const length = 1 + value * 26;
      context.strokeStyle = value > 0.8 ? heat : signal;
      context.globalAlpha = 0.28 + value * 0.72;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(c + Math.cos(angle) * base, c + Math.sin(angle) * base);
      context.lineTo(c + Math.cos(angle) * (base + length), c + Math.sin(angle) * (base + length));
      context.stroke();
    }
    context.globalAlpha = 1;

    // The hand: a fine crosshair on the pixel being played.
    const hand = handRef.current;
    if (hand) {
      context.strokeStyle = heat;
      context.lineWidth = 1;
      context.beginPath();
      context.arc(hand.x, hand.y, 9, 0, Math.PI * 2);
      context.moveTo(hand.x - 18, hand.y);
      context.lineTo(hand.x - 5, hand.y);
      context.moveTo(hand.x + 5, hand.y);
      context.lineTo(hand.x + 18, hand.y);
      context.moveTo(hand.x, hand.y - 18);
      context.lineTo(hand.x, hand.y - 5);
      context.moveTo(hand.x, hand.y + 5);
      context.lineTo(hand.x, hand.y + 18);
      context.stroke();
    }
  });

  const sampleAt = (clientX: number, clientY: number): BlueMarbleSample | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scale = CSS_SIZE / rect.width;
    return sampleAtCss((clientX - rect.left) * scale, (clientY - rect.top) * scale);
  };

  /** Sample the globe at a point in the canvas's own 620-pixel space. */
  const sampleAtCss = (x: number, y: number): BlueMarbleSample | null => {
    const lookup = lookupRef.current;
    if (!lookup) return null;
    handRef.current = { x, y };
    const ratio = lookup.radius / RADIUS;
    const gx = Math.round((x - CSS_SIZE / 2) * ratio + lookup.size / 2);
    const gy = Math.round((y - CSS_SIZE / 2) * ratio + lookup.size / 2);
    if (gx < 0 || gy < 0 || gx >= lookup.size || gy >= lookup.size) return null;
    const index = gy * lookup.size + gx;
    if (!lookup.inside[index]) return null;
    let lon = lookup.lon[index] + rotation.current;
    lon = ((((lon + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
    const lat = Math.PI / 2 - lookup.row[index] * Math.PI;
    const texture = textureRef.current;
    let luminance: number | null = null;
    if (texture) {
      const u = (lon + Math.PI) / (Math.PI * 2);
      const tx = Math.min(texture.width - 1, Math.max(0, Math.floor(u * texture.width)));
      const ty = Math.min(texture.height - 1, Math.max(0, Math.floor(lookup.row[index] * texture.height)));
      const offset = (ty * texture.width + tx) * 4;
      luminance =
        (0.2126 * texture.data[offset] + 0.7152 * texture.data[offset + 1] + 0.0722 * texture.data[offset + 2]) / 255;
    }
    return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI, luminance };
  };

  return (
    <figure className="hero-earth">
      <canvas
        ref={canvasRef}
        className="hero-canvas"
        style={{ width: CSS_SIZE, height: CSS_SIZE }}
        tabIndex={0}
        role="application"
        aria-roledescription="playable globe"
        aria-label="NASA Blue Marble Earth inside a ring that shows the live sound. Press and drag across the planet, or use the arrow keys (Shift for bigger steps), to hear the brightness of the picture under the crosshair. Escape lets go. The live caption says where you are."
        onKeyDown={onKey}
        onBlur={() => {
          if (handRef.current) release();
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          onTouchRef.current(sampleAt(event.clientX, event.clientY));
        }}
        onPointerMove={(event) => {
          if (!handRef.current) return;
          onTouchRef.current(sampleAt(event.clientX, event.clientY));
        }}
        onPointerUp={() => {
          handRef.current = null;
          onTouchRef.current(null);
        }}
        onPointerCancel={() => {
          handRef.current = null;
          onTouchRef.current(null);
        }}
      />
      <figcaption className="label">
        {problem ?? "Blue Marble Next Generation · NASA GIBS · August 2004"}
      </figcaption>
    </figure>
  );
}
