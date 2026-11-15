/** The app's pages, addressed by URL hash so Back, reload and links work: #/jukebox. */
export const VIEWS = ["home", "listen", "case", "test", "jukebox", "cosmic", "soundmap", "time", "timeline", "lab", "science"] as const;
export type View = (typeof VIEWS)[number];

export function parseView(hash: string): View {
  const name = hash.replace(/^#\/?/, "").split(/[?/]/)[0].toLowerCase();
  return (VIEWS as readonly string[]).includes(name) ? (name as View) : "home";
}

export function viewHash(view: View): string {
  return view === "home" ? "#/" : `#/${view}`;
}

/**
 * The page to open first. The hash wins; a shared link without one
 * (?mode=cosmic&lat=…, or a Sonic Lab ?lab=…) opens the page it names.
 */
export function initialView(hash: string, search: string): View {
  const fromHash = parseView(hash);
  if (fromHash !== "home" || hash.replace(/^#\/?/, "") !== "") return fromHash;
  const params = new URLSearchParams(search);
  if (params.has("lab")) return "lab";
  return parseView(params.get("mode") ?? "");
}
