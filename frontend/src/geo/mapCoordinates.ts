/** A pointer position on an equirectangular world map to latitude and longitude, clamped to the map. */
export function mapCoordinates(clientX: number, clientY: number, bounds: Pick<DOMRect, "left" | "top" | "width" | "height">): { lat: number; lon: number } {
  const x = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
  const y = Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height));
  return { lat: 90 - y * 180, lon: -180 + x * 360 };
}
