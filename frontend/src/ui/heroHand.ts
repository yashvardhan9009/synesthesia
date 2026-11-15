export type HandPoint = { x: number; y: number };

export const HERO_CANVAS_SIZE = 620;
export const HERO_GLOBE_RADIUS = 214;

/** The landing globe's arrow-key crosshair movement, in its canvas coordinate space. */
export function stepHeroHand(point: HandPoint | null, key: string, shift = false): HandPoint | null {
  const stride = shift ? 36 : 12;
  const move: Record<string, [number, number]> = {
    ArrowLeft: [-stride, 0],
    ArrowRight: [stride, 0],
    ArrowUp: [0, -stride],
    ArrowDown: [0, stride],
  };
  const center = HERO_CANVAS_SIZE / 2;
  const from = point ?? { x: center, y: center };
  const delta = move[key];
  if (!delta) return key === "Enter" || key === " " ? from : null;
  let x = from.x + delta[0];
  let y = from.y + delta[1];
  const dx = x - center;
  const dy = y - center;
  const distance = Math.hypot(dx, dy);
  const limit = HERO_GLOBE_RADIUS - 4;
  if (distance > limit) {
    x = center + (dx / distance) * limit;
    y = center + (dy / distance) * limit;
  }
  return { x, y };
}
