import { useEffect, useRef, useState } from "react";

type Marker = { lat: number; lon: number };

import type { BlueMarbleSample } from "../audio/touch.ts";

type Props = {
  marker: Marker;
  onPick: (lat: number, lon: number) => void;
  reducedMotion: boolean;
  hand?: boolean;
  onHand?: (sample: BlueMarbleSample | null) => void;
};

const SIZE = 300;

function wrap(degrees: number): number {
  let value = degrees;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

type Hit = { lat: number; lon: number };

function project(x: number, y: number, lat0: number, lon0: number): Hit | null {
  const radius = SIZE / 2 - 8;
  const nx = (x - SIZE / 2) / radius;
  const ny = (y - SIZE / 2) / radius;
  const r2 = nx * nx + ny * ny;
  if (r2 > 1) return null;
  const nz = Math.sqrt(1 - r2);
  const cosLat = Math.cos(lat0);
  const sinLat = Math.sin(lat0);
  const y2 = -ny * cosLat - nz * sinLat;
  const z2 = -ny * sinLat + nz * cosLat;
  const cosLon = Math.cos(lon0);
  const sinLon = Math.sin(lon0);
  const x3 = nx * cosLon + z2 * sinLon;
  const z3 = -nx * sinLon + z2 * cosLon;
  return {
    lat: Math.asin(Math.max(-1, Math.min(1, y2))),
    lon: Math.atan2(x3, z3),
  };
}

export function Globe({ marker, onPick, reducedMotion, hand = false, onHand }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textureRef = useRef<ImageData | null>(null);
  // In this projection a negative view latitude tilts the northern hemisphere toward the viewer.
  const viewRef = useRef({ lat: -20, lon: 78 });
  const markerRef = useRef(marker);
  const handRef = useRef(hand);
  const onHandRef = useRef(onHand);
  handRef.current = hand;
  onHandRef.current = onHand;
  const dragRef = useRef(false);
  const velocityRef = useRef({ lon: 0, lat: 0 });
  const drawRef = useRef<() => void>(() => {});
  const [problem, setProblem] = useState<string | null>(null);
  markerRef.current = marker;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let lastSpin = 0;
    let alive = true;

    const draw = () => {
      const image = context.createImageData(SIZE, SIZE);
      const pixels = image.data;
      const lat0 = (viewRef.current.lat * Math.PI) / 180;
      const lon0 = (viewRef.current.lon * Math.PI) / 180;
      const source = textureRef.current;
      const mark = markerRef.current;
      for (let y = 0; y < SIZE; y += 1) {
        for (let x = 0; x < SIZE; x += 1) {
          const offset = (y * SIZE + x) * 4;
          const hit = project(x, y, lat0, lon0);
          if (!hit) {
            pixels[offset + 3] = 0;
            continue;
          }
          const latDeg = (hit.lat * 180) / Math.PI;
          const lonDeg = (hit.lon * 180) / Math.PI;
          let red = 16;
          let green = 26;
          let blue = 46;
          if (source) {
            const u = (hit.lon + Math.PI) / (2 * Math.PI);
            const v = (Math.PI / 2 - hit.lat) / Math.PI;
            const tx = Math.min(source.width - 1, Math.max(0, Math.floor(u * source.width)));
            const ty = Math.min(source.height - 1, Math.max(0, Math.floor(v * source.height)));
            const sourceOffset = (ty * source.width + tx) * 4;
            red = source.data[sourceOffset];
            green = source.data[sourceOffset + 1];
            blue = source.data[sourceOffset + 2];
          }
          if (Math.abs(latDeg % 30) < 0.65 || Math.abs(wrap(lonDeg) % 30) < 0.65) {
            red = Math.min(255, red + 36);
            green = Math.min(255, green + 32);
            blue = Math.min(255, blue + 20);
          }
          const distance = Math.hypot(latDeg - mark.lat, wrap(lonDeg - mark.lon));
          if (distance < 2.2) {
            // Selected point, in the thermal accent.
            red = 255;
            green = 179;
            blue = 71;
          }
          pixels[offset] = red;
          pixels[offset + 1] = green;
          pixels[offset + 2] = blue;
          pixels[offset + 3] = 255;
        }
      }
      context.putImageData(image, 0, 0);
    };
    drawRef.current = draw;

    const spin = (now: number) => {
      if (!alive) return;
      if (lastSpin === 0) lastSpin = now;
      const elapsed = Math.min(64, now - lastSpin);
      if (elapsed >= 45) {
        lastSpin = now;
        const velocity = velocityRef.current;
        if (!reducedMotion && !dragRef.current && (Math.abs(velocity.lon) > 0.015 || Math.abs(velocity.lat) > 0.015)) {
          viewRef.current.lon = wrap(viewRef.current.lon + velocity.lon);
          viewRef.current.lat = Math.max(-70, Math.min(70, viewRef.current.lat + velocity.lat));
          velocity.lon *= 0.91;
          velocity.lat *= 0.91;
          draw();
        } else if (!reducedMotion && !dragRef.current) {
          viewRef.current.lon = wrap(viewRef.current.lon + elapsed * 0.0056);
          draw();
        }
      }
      if (!reducedMotion) frame = window.requestAnimationFrame(spin);
    };
    draw();
    if (!reducedMotion) frame = window.requestAnimationFrame(spin);

    const photo = new Image();
    photo.onload = () => {
      if (!alive) return;
      const scratch = document.createElement("canvas");
      scratch.width = photo.width;
      scratch.height = photo.height;
      const scratchContext = scratch.getContext("2d");
      if (!scratchContext) return;
      scratchContext.drawImage(photo, 0, 0);
      textureRef.current = scratchContext.getImageData(0, 0, photo.width, photo.height);
      setProblem(null);
      draw();
    };
    photo.onerror = () => {
      setProblem("NASA GIBS Blue Marble did not load. You can still type a latitude and longitude.");
    };
    photo.src = "/api/gibs/bluemarble";

    let moved = false;
    let lastX = 0;
    let lastY = 0;
    const onDown = (event: PointerEvent) => {
      dragRef.current = true;
      moved = false;
      velocityRef.current = { lon: 0, lat: 0 };
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (Math.hypot(dx, dy) > 3) moved = true;
      lastX = event.clientX;
      lastY = event.clientY;
      if (handRef.current) {
        const rect = canvas.getBoundingClientRect();
        const px = ((event.clientX - rect.left) / rect.width) * SIZE;
        const py = ((event.clientY - rect.top) / rect.height) * SIZE;
        const hit = project(px, py, (viewRef.current.lat * Math.PI) / 180, (viewRef.current.lon * Math.PI) / 180);
        if (!hit) {
          onHandRef.current?.(null);
          return;
        }
        const source = textureRef.current;
        let luminance: number | null = null;
        if (source) {
          const u = (hit.lon + Math.PI) / (2 * Math.PI);
          const v = (Math.PI / 2 - hit.lat) / Math.PI;
          const tx = Math.min(source.width - 1, Math.max(0, Math.floor(u * source.width)));
          const ty = Math.min(source.height - 1, Math.max(0, Math.floor(v * source.height)));
          const offset = (ty * source.width + tx) * 4;
          luminance = (0.2126 * source.data[offset] + 0.7152 * source.data[offset + 1] + 0.0722 * source.data[offset + 2]) / 255;
        }
        onHandRef.current?.({
          lat: (hit.lat * 180) / Math.PI,
          lon: (hit.lon * 180) / Math.PI,
          luminance,
        });
        return;
      }
      viewRef.current.lon = wrap(viewRef.current.lon - dx * 0.4);
      viewRef.current.lat = Math.max(-70, Math.min(70, viewRef.current.lat + dy * 0.3));
      velocityRef.current = reducedMotion ? { lon: 0, lat: 0 } : { lon: -dx * 0.4, lat: dy * 0.3 };
      draw();
    };
    const onUp = (event: PointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = false;
      if (handRef.current) onHandRef.current?.(null);
      if (moved) return;
      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * SIZE;
      const y = ((event.clientY - rect.top) / rect.height) * SIZE;
      const hit = project(
        x,
        y,
        (viewRef.current.lat * Math.PI) / 180,
        (viewRef.current.lon * Math.PI) / 180,
      );
      if (!hit) return;
      onPick((hit.lat * 180) / Math.PI, (hit.lon * 180) / Math.PI);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onPick((viewRef.current.lat * Math.PI) / 180, (viewRef.current.lon * Math.PI) / 180);
        return;
      }
      const step = event.shiftKey ? 30 : 12;
      if (event.key === "ArrowLeft") viewRef.current.lon = wrap(viewRef.current.lon - step);
      else if (event.key === "ArrowRight") viewRef.current.lon = wrap(viewRef.current.lon + step);
      else if (event.key === "ArrowUp") viewRef.current.lat = Math.max(-70, viewRef.current.lat - step);
      else if (event.key === "ArrowDown") viewRef.current.lat = Math.min(70, viewRef.current.lat + step);
      else return;
      event.preventDefault();
      draw();
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("keydown", onKey);
    };
  }, [onPick, reducedMotion]);

  useEffect(() => {
    drawRef.current();
  }, [marker]);

  const ticks = Array.from({ length: 72 }, (_, index) => index * 5);

  return (
    <figure className="globe-wrap">
      <div className="globe-ring">
        <svg className="bezel" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="ring" cx="50" cy="50" r="46" strokeWidth="0.25" />
          {ticks.map((degree) => {
            const angle = (degree * Math.PI) / 180;
            const long = degree % 90 === 0 ? 3 : degree % 30 === 0 ? 2 : 1;
            return (
              <line
                key={degree}
                className="tick"
                strokeWidth={degree % 30 === 0 ? 0.35 : 0.2}
                x1={50 + Math.sin(angle) * 46}
                y1={50 - Math.cos(angle) * 46}
                x2={50 + Math.sin(angle) * (46 + long)}
                y2={50 - Math.cos(angle) * (46 + long)}
              />
            );
          })}
        </svg>
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          className={hand ? "globe hand-on" : "globe"}
          role="application"
          tabIndex={0}
          aria-label="Earth globe. Click a place to hear its NASA POWER record. Press Enter to select the view center. With Hand on, drag across the picture to play the Blue Marble pixel under your hand. Arrow keys rotate the view."
        />
      </div>
      <figcaption>
        {problem ??
          "NASA GIBS Blue Marble Next Generation, August 2004. Drag to turn. Click to choose a point."}
      </figcaption>
    </figure>
  );
}
