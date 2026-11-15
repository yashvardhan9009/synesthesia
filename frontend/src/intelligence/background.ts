/**
 * General background for the preset regions: textbook geography, shown under
 * the label "General background (not an attribution)". Nothing here is
 * computed from the data, and nothing here explains a particular finding.
 */
export const BACKGROUND_LABEL = "General background (not an attribution)";

export const REGION_BACKGROUND: Record<string, string> = {
  "indian-ocean":
    "Temperature and rainfall over the tropical Indian Ocean are known to vary with the Indian Ocean Dipole and with the El Niño–Southern Oscillation, and the basin's surface has warmed in long-term records. This is general knowledge about the basin; it does not say what caused any month listed here.",
  sahel:
    "Most Sahel rainfall arrives in the June–September monsoon season, and the region's rainfall is known to vary strongly from decade to decade; a long dry period from the 1970s into the 1980s is well documented. This is general knowledge about the region; it does not say what caused any month listed here.",
  amazon:
    "The Amazon basin has a wet season and a dry season, and droughts have been documented there in several years with El Niño conditions or an unusually warm tropical North Atlantic. This is general knowledge about the basin; it does not say what caused any month listed here.",
  arctic:
    "Observational records show the Arctic warming faster than the global average, most strongly in the cold season, a pattern often called Arctic amplification. This is general knowledge about the region; it does not say what caused any month listed here.",
};

/** Shown for searched or clicked boxes, where no region-specific note exists. */
export const GENERIC_BACKGROUND =
  "A single month's departure from normal mixes weather, seasonal variability and longer changes; a monthly record alone cannot separate them. This is general background, not an explanation of any finding.";
