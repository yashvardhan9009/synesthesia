import type { Soundscape } from "../audio/soundscape.ts";

/**
 * The same sound with everything that could be read stripped: no place,
 * dates, request, captions or traces. Trials play these, so the dock and the
 * trace drawer have nothing to show but the clip's name.
 */
export function earOnly(scape: Soundscape, name: string): Soundscape {
  return {
    ...scape,
    title: `Listening Test · ${name}`,
    place: name,
    latitude: 0,
    longitude: 0,
    start: "",
    end: "",
    dataset: "Hidden during the test",
    requestUrl: "",
    steps: scape.steps.map((step, index) => ({ ...step, date: "", label: `${name}, note ${index + 1}`, traces: [], caption: "", source: undefined, requestUrl: undefined })),
  };
}
