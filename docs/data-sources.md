# Data sources

Checked against the NASA Space Apps 2026 resources tab on 14 November 2026:

https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/

The resources tab points at the SVS Earth Information Center gallery and names these nine visualizations, in this order:

| SVS | Title | What SYNESTHESIA measures |
| --- | --- | --- |
| [5313](https://svs.gsfc.nasa.gov/5313/) | Change in Night Lights between 2012 and 2023 | West-to-east scan of the official preview still. Pitch from brightness. |
| [3912](https://svs.gsfc.nasa.gov/3912/) | Global Sea Surface Currents and Temperature | 24 frames from `ecco2_sst_flow.webmhd.webm` (about 15 MB). Pitch from warmth. |
| [5669](https://svs.gsfc.nasa.gov/5669/) | GEOS Aerosols | West-to-east scan of the 19 August 2025 still. Pitch from warmth. |
| [5533](https://svs.gsfc.nasa.gov/5533/) | Air Quality Model Runs | The master movie is about 300 MB. Scan of the official 1920×1080 preview. |
| [5425](https://svs.gsfc.nasa.gov/5425/) | Perpetual Ocean 2: Western Boundary Currents | The master movie is about 1.2 GB. Scan of the official preview still. |
| [5196](https://svs.gsfc.nasa.gov/5196/) | DYAMOND Global Carbon Dioxide | 24 frames from the 1080p globe movie (about 45 MB). Pitch from warmth. |
| [5011](https://svs.gsfc.nasa.gov/5011/) | Lightning Events Detected from the ISS, 2017–2023 | The sphere movie is about 130 MB. Scan of the official preview. Pitch from brightness. |
| [4960](https://svs.gsfc.nasa.gov/4960/) | A 3D View of an Atmospheric River | The narrated movie is about 70 MB. Scan of the official still. Pitch from contrast. |
| [4950](https://svs.gsfc.nasa.gov/4950/) | GEDI Forest Height | 24 frames from `GEDI_global_w_colorbar_1080p60.webm` (about 6 MB). Pitch from warmth. |

Gallery index: https://svs.gsfc.nasa.gov/gallery/earth-information-center/

Descriptions are loaded from `https://svs.gsfc.nasa.gov/api/{id}/`. The file list that SVS appends after `||` is not shown.

## Cosmic Earth and Time Machine

NASA POWER daily point API, community `AG`, no key:

`https://power.larc.nasa.gov/api/temporal/daily/point`

Parameters: `T2M`, `PRECTOTCORR`, `WS10M`, `ALLSKY_SFC_SW_DWN`, `RH2M`. Documented fill value −999 is returned to the page as missing. Time Machine asks only for `T2M`.

## Globe imagery

NASA GIBS Web Map Service, layer `BlueMarble_NextGeneration`, 1 August 2004, EPSG:4326, 1024×512 JPEG:

`https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi`

## How a number becomes a note

The full method, with every formula and a worked example, is on the in-app **Science & Methodology** page (`#/science`, source in `frontend/src/science-page/`). In short:

1. Missing values are dropped.
2. The rest are scaled with the 5th and 95th percentiles of that series, then clamped to 0–1, so one extreme does not flatten every other day.
3. Anomalies are a robust z-score: `0.6745 * (value − median) / MAD`. A flat series with one spike is still flagged. The default threshold is 2.5.
4. The scaled value is quantized onto a musical scale (pentatonic by default) across two octaves. Both ends of the range are the tonic.
5. An outlier is louder, brighter, and marked with a short ping. Rain adds noise, wind opens a low-pass filter, humidity adds a fifth. Those are modulations of the POWER series, not extra data.

Pixel statistics use standard luminance `0.2126 R + 0.7152 G + 0.0722 B`. Warmth is red minus blue, mapped to 0–1.

Each jukebox frame also has a soundscape (`frontend/src/jukebox/voicing.ts`): an oscillator shape, a harmony interval and a noise bed. These are design choices that carry no data; pitch, loudness, filter and the outlier flag are left exactly as measured, and a unit test holds them to that.
