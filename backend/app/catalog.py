"""The nine EIC visualizations named on the Space Apps 2026 resources tab.

Official page: https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/
Resources checked 14 Nov 2026. Each entry points at a NASA SVS page in the
Earth Information Center gallery. `media_url` is the file we measure.
Videos larger than the download cap are not listed; those tracks scan the
official preview still instead, and the response says so.
"""

from __future__ import annotations

from typing import Literal, TypedDict

PitchFrom = Literal["luminance", "warmth", "contrast"]
Kind = Literal["image", "video"]


class Track(TypedDict):
    svs_id: int
    title: str
    page_url: str
    poster_url: str
    media_url: str
    kind: Kind
    pitch_from: PitchFrom
    reading: str


TRACKS: list[Track] = [
    {
        "svs_id": 5313,
        "title": "Change in Night Lights between 2012 and 2023",
        "page_url": "https://svs.gsfc.nasa.gov/5313/",
        "poster_url": "https://svs.gsfc.nasa.gov/vis/a000000/a005300/a005313/nightlights_flat_series_and_change_wZooms_13_EIC.02599_print.jpg",
        "media_url": "https://svs.gsfc.nasa.gov/vis/a000000/a005300/a005313/nightlights_flat_series_and_change_wZooms_13_EIC.02599_print.jpg",
        "kind": "image",
        "pitch_from": "luminance",
        "reading": "The official EIC preview frame is read from west to east. Brighter city lights sit higher on a pentatonic scale; dark ocean stays low and quiet. This is the picture's brightness, not a separate nighttime-radiance table.",
    },
    {
        "svs_id": 3912,
        "title": "Global Sea Surface Currents and Temperature",
        "page_url": "https://svs.gsfc.nasa.gov/3912/",
        "poster_url": "https://svs.gsfc.nasa.gov/vis/a000000/a003900/a003912/flat_global_ecco2_2028x1024.25000_web.png",
        "media_url": "https://svs.gsfc.nasa.gov/vis/a000000/a003900/a003912/ecco2_sst_flow.webmhd.webm",
        "kind": "video",
        "pitch_from": "warmth",
        "reading": "Frames are sampled across the ECCO2 sea-surface movie. Pitch follows warmth (red minus blue), which is how this visualization paints temperature. Current motion shows up as frame-to-frame change, not as a separate velocity number.",
    },
    {
        "svs_id": 5669,
        "title": "GEOS Aerosols",
        "page_url": "https://svs.gsfc.nasa.gov/5669/",
        "poster_url": "https://svs.gsfc.nasa.gov/vis/a000000/a005600/a005669/Aerosols_2025-08-19T20_00_00_1920x1080.png",
        "media_url": "https://svs.gsfc.nasa.gov/vis/a000000/a005600/a005669/Aerosols_2025-08-19T20_00_00_1920x1080.png",
        "kind": "image",
        "pitch_from": "warmth",
        "reading": "SVS 5669 is a still of GEOS aerosols on 19 August 2025. The jukebox scans it west to east. Pitch follows the color palette (dustier reds against bluer air), which is the legend of this frame rather than a station measurement.",
    },
    {
        "svs_id": 5533,
        "title": "Air Quality Model Runs",
        "page_url": "https://svs.gsfc.nasa.gov/5533/",
        "poster_url": "https://svs.gsfc.nasa.gov/vis/a000000/a005500/a005533/AirQuality_Sphere_1920x1080_0000.png",
        "media_url": "https://svs.gsfc.nasa.gov/vis/a000000/a005500/a005533/AirQuality_Sphere_1920x1080_0000.png",
        "kind": "image",
        "pitch_from": "warmth",
        "reading": "The full model movie is a multi-hundred-megabyte file, so this track scans the official 1920×1080 preview frame. Color in that frame is the air-quality scale; the scan turns that palette into pitch.",
    },
    {
        "svs_id": 5425,
        "title": "Perpetual Ocean 2: Western Boundary Currents",
        "page_url": "https://svs.gsfc.nasa.gov/5425/",
        "poster_url": "https://svs.gsfc.nasa.gov/vis/a000000/a005400/a005425/perpetual_ocean2_CLOSE_093_4k_clean_noDate.00000_print.jpg",
        "media_url": "https://svs.gsfc.nasa.gov/vis/a000000/a005400/a005425/perpetual_ocean2_CLOSE_093_4k_clean_noDate.00000_print.jpg",
        "kind": "image",
        "pitch_from": "warmth",
        "reading": "The Perpetual Ocean 2 master movie is over a gigabyte, so the jukebox reads the official preview still of the western-boundary currents. Warm colors in the current field sit higher in the scale.",
    },
    {
        "svs_id": 5196,
        "title": "DYAMOND Global Carbon Dioxide",
        "page_url": "https://svs.gsfc.nasa.gov/5196/",
        "poster_url": "https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005196/dyamondPointCloud_12-1-2023b_dyamond_co2_anim_globe_orbit_3x3Hyperwall.00200_print.jpg",
        "media_url": "https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005196/dyamondPointCloud_3-29-2023a_dyamond_co2_anim_globe_zoom_1080p30.mp4",
        "kind": "video",
        "pitch_from": "warmth",
        "reading": "Frames are sampled from the DYAMOND carbon-dioxide globe movie. Pitch follows the color scale of the point cloud as the camera moves. It is the visualization's palette over the clip, not a Mauna Loa flask record.",
    },
    {
        "svs_id": 5011,
        "title": "Lightning Events Detected from the ISS, 2017–2023",
        "page_url": "https://svs.gsfc.nasa.gov/5011/",
        "poster_url": "https://svs.gsfc.nasa.gov/vis/a000000/a005000/a005011/iss_lightning_preview.jpg",
        "media_url": "https://svs.gsfc.nasa.gov/vis/a000000/a005000/a005011/iss_lightning_preview.jpg",
        "kind": "image",
        "pitch_from": "luminance",
        "reading": "The sphere movie is too large to pull during a demo, so this track scans the official lightning preview. Bright clusters — the flashes — are louder and higher; dark space stays quiet.",
    },
    {
        "svs_id": 4960,
        "title": "A 3D View of an Atmospheric River",
        "page_url": "https://svs.gsfc.nasa.gov/4960/",
        "poster_url": "https://svs.gsfc.nasa.gov/vis/a000000/a004900/a004960/atmos_river.0324_rfm23_2021-11-29_1351.04370_print.jpg",
        "media_url": "https://svs.gsfc.nasa.gov/vis/a000000/a004900/a004960/atmos_river.0324_rfm23_2021-11-29_1351.04370_print.jpg",
        "kind": "image",
        "pitch_from": "contrast",
        "reading": "The narrated movie is about 70 MB, so the jukebox scans the official still of the atmospheric river. Pitch follows contrast, which picks out the dense moisture filament against the calmer surroundings.",
    },
    {
        "svs_id": 4950,
        "title": "GEDI Forest Height",
        "page_url": "https://svs.gsfc.nasa.gov/4950/",
        "poster_url": "https://svs.gsfc.nasa.gov/vis/a000000/a004900/a004950/GEDI_global_w_colorbar_0900_print.jpg",
        "media_url": "https://svs.gsfc.nasa.gov/vis/a000000/a004900/a004950/GEDI_global_w_colorbar_1080p60.webm",
        "kind": "video",
        "pitch_from": "warmth",
        "reading": "Frames are sampled from the GEDI global canopy movie. Taller forest is drawn in warmer colors on this color scale, and those warmer frames sit higher in pitch. The metre values themselves are not a separate numeric file in this SVS release.",
    },
]


def track_by_id(svs_id: int) -> Track | None:
    for track in TRACKS:
        if track["svs_id"] == svs_id:
            return track
    return None
