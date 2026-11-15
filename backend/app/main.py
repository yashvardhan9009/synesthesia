"""SVS / POWER / GIBS proxy for SYNESTHESIA.

The browser never invents Earth data. If NASA does not answer, the response
is an error the interface can show.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import subprocess
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from urllib.parse import quote, urlparse

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, Response

from app.analyze import frame_sample, spatial_samples
from app.catalog import TRACKS, track_by_id
from app.history import (
    BASELINE_END_YEAR,
    BASELINE_HALF_WINDOW,
    BASELINE_PARAMETERS,
    BASELINE_START_YEAR,
    MONTHLY_FIRST_YEAR,
    MONTHLY_MAX_YEARS,
    calendar_baseline,
    split_monthly,
)
from app.power import ALLOWED_PARAMETERS, DEFAULT_PARAMETERS, parse_power

log = logging.getLogger("synesthesia")
logging.basicConfig(level=logging.INFO)

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache"
CACHE.mkdir(exist_ok=True)

GIBS_BLUE_MARBLE = (
    "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
    "?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=BlueMarble_NextGeneration"
    "&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=1024&HEIGHT=512"
    "&FORMAT=image/jpeg&TIME=2004-08-01"
)
POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
POWER_MONTHLY_URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
SVS_HOSTS = {"svs.gsfc.nasa.gov"}
MAX_VIDEO_BYTES = 50_000_000
SAMPLE_COUNT = 24
ALGORITHM = 1

_locks: dict[int, asyncio.Lock] = {}
_client: httpx.AsyncClient | None = None


def _lock(svs_id: int) -> asyncio.Lock:
    if svs_id not in _locks:
        _locks[svs_id] = asyncio.Lock()
    return _locks[svs_id]


def _client_or_raise() -> httpx.AsyncClient:
    if _client is None:
        raise HTTPException(500, "HTTP client is not ready.")
    return _client


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _client
    _client = httpx.AsyncClient(
        headers={"User-Agent": "SYNESTHESIA/1.0 (NASA Space Apps 2026; educational)"},
        follow_redirects=True,
        timeout=httpx.Timeout(120.0, connect=20.0),
    )
    prewarm = asyncio.create_task(_prewarm())
    yield
    prewarm.cancel()
    await _client.aclose()
    _client = None


app = FastAPI(title="SYNESTHESIA data proxy", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)
# Region and history responses are large, repetitive JSON (about 170 KB for a region); gzip shrinks them several-fold.
app.add_middleware(GZipMiddleware, minimum_size=1000)


def _cache_file(url: str) -> Path:
    digest = hashlib.sha256(url.encode()).hexdigest()[:20]
    suffix = Path(urlparse(url).path).suffix.lower() or ".bin"
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".webm", ".mp4", ".gif"}:
        suffix = ".bin"
    return CACHE / "remote" / f"{digest}{suffix}"


def _assert_svs(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in SVS_HOSTS:
        raise HTTPException(400, "Only https://svs.gsfc.nasa.gov media can be fetched.")
    if not parsed.path.startswith("/vis/"):
        raise HTTPException(400, "That SVS path is not a visualization file.")


async def download(url: str, limit: int | None = None) -> Path:
    _assert_svs(url)
    path = _cache_file(url)
    if path.exists() and path.stat().st_size > 0:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    client = _client_or_raise()
    temporary = path.with_suffix(path.suffix + ".part")
    try:
        async with client.stream("GET", url) as response:
            if response.status_code >= 400:
                body = (await response.aread())[:400].decode("utf-8", "replace")
                raise HTTPException(
                    502,
                    f"NASA SVS returned {response.status_code} for {url}. {body}",
                )
            host = response.url.host or ""
            if host not in SVS_HOSTS:
                raise HTTPException(502, f"SVS redirected off-site to {response.url}.")
            length = response.headers.get("content-length")
            if limit is not None and length and int(length) > limit:
                raise HTTPException(
                    413,
                    f"That SVS file is {length} bytes, over the {limit} byte cap. "
                    "The track will have to use the preview still.",
                )
            size = 0
            with temporary.open("wb") as handle:
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if limit is not None and size > limit:
                        raise HTTPException(413, "SVS file grew past the download cap.")
                    handle.write(chunk)
        temporary.replace(path)
    except HTTPException:
        temporary.unlink(missing_ok=True)
        raise
    except Exception as exc:
        temporary.unlink(missing_ok=True)
        raise HTTPException(502, f"Could not download SVS media: {exc}") from exc
    return path


def _proxy_path(url: str) -> str:
    return "/api/media?src=" + quote(url, safe="")


def _meta_path() -> Path:
    return CACHE / "svs-meta.json"


def _read_meta() -> dict:
    path = _meta_path()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return {}


def _write_meta(meta: dict) -> None:
    _meta_path().write_text(json.dumps(meta))


async def _describe(svs_id: int) -> dict:
    meta = _read_meta()
    cached = meta.get(str(svs_id))
    if cached and cached.get("description"):
        return cached
    client = _client_or_raise()
    try:
        response = await client.get(f"https://svs.gsfc.nasa.gov/api/{svs_id}/")
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:
        return {
            "description": None,
            "release_date": None,
            "error": f"SVS description could not be loaded: {exc}",
        }
    text = re.sub(r"<[^>]+>", " ", payload.get("description") or "")
    text = text.split("||", 1)[0]
    text = re.sub(r"\[\[[^\]]*\]\]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    record = {
        "description": text[:900] or None,
        "release_date": payload.get("release_date"),
        "error": None,
    }
    if record["description"]:
        meta[str(svs_id)] = record
        _write_meta(meta)
    return record


def _clean_description(text: str | None) -> str | None:
    if not text:
        return text
    prose = text.split("||", 1)[0]
    prose = re.sub(r"\s+", " ", prose).strip()
    return prose or None


def _summary(track: dict, meta: dict) -> dict:
    return {
        "svs_id": track["svs_id"],
        "title": track["title"],
        "page_url": track["page_url"],
        "poster_url": _proxy_path(track["poster_url"]),
        "kind": track["kind"],
        "pitch_from": track["pitch_from"],
        "reading": track["reading"],
        "nasa_description": _clean_description(meta.get("description")),
        "description_error": meta.get("error"),
        "release_date": meta.get("release_date"),
    }


def _samples_path(svs_id: int) -> Path:
    return CACHE / "frames" / str(svs_id) / "samples.json"


def _extract_frames(video: Path, dest: Path, count: int) -> list[Path]:
    dest.mkdir(parents=True, exist_ok=True)
    for old in list(dest.glob("f_*.jpg")) + list(dest.glob("frame_*.jpg")):
        old.unlink()
    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "csv=p=0",
            str(video),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    try:
        duration = max(0.5, float(probe.stdout.strip() or "8"))
    except ValueError:
        duration = 8.0
    fps = count / duration
    pattern = str(dest / "f_%02d.jpg")
    done = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(video),
            "-vf",
            f"fps={fps},scale=320:-1",
            "-frames:v",
            str(count),
            pattern,
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    frames = sorted(dest.glob("f_*.jpg"))
    if done.returncode != 0 or not frames:
        tail = (done.stderr or "")[-400:]
        raise RuntimeError(f"ffmpeg could not read the SVS movie. {tail}")
    renamed: list[Path] = []
    for index, frame in enumerate(frames):
        target = dest / f"frame_{index:02d}.jpg"
        frame.replace(target)
        renamed.append(target)
    return renamed


async def ensure_samples(svs_id: int) -> dict:
    track = track_by_id(svs_id)
    if track is None:
        raise HTTPException(404, f"SVS {svs_id} is not one of the nine EIC jukebox frames.")
    cached = _samples_path(svs_id)
    if cached.exists():
        payload = json.loads(cached.read_text())
        if payload.get("algorithm") == ALGORITHM:
            return payload

    async with _lock(svs_id):
        if cached.exists():
            payload = json.loads(cached.read_text())
            if payload.get("algorithm") == ALGORITHM:
                return payload
        meta = await _describe(svs_id)
        warning = None
        method = "spatial-scan"
        source_url = track["media_url"]
        frame_dir = CACHE / "frames" / str(svs_id)
        samples: list[dict]

        if track["kind"] == "video":
            try:
                video = await download(track["media_url"], limit=MAX_VIDEO_BYTES)
                frames = await asyncio.to_thread(
                    _extract_frames, video, frame_dir, SAMPLE_COUNT
                )
                samples = []
                total = len(frames)
                for index, frame in enumerate(frames):
                    sample = frame_sample(frame.read_bytes(), index, total)
                    sample["image_url"] = f"/api/jukebox/{svs_id}/frame/{index}.jpg"
                    samples.append(sample)
                method = "temporal-frames"
            except HTTPException as exc:
                warning = str(exc.detail)
                source_url = track["poster_url"]
                poster = await download(track["poster_url"])
                samples = spatial_samples(poster.read_bytes(), SAMPLE_COUNT)
                for sample in samples:
                    sample["image_url"] = _proxy_path(track["poster_url"])
            except Exception as exc:
                warning = f"The SVS movie could not be sampled ({exc}). The official preview still is used instead."
                source_url = track["poster_url"]
                poster = await download(track["poster_url"])
                samples = spatial_samples(poster.read_bytes(), SAMPLE_COUNT)
                for sample in samples:
                    sample["image_url"] = _proxy_path(track["poster_url"])
        else:
            poster = await download(track["poster_url"])
            samples = spatial_samples(poster.read_bytes(), SAMPLE_COUNT)
            for sample in samples:
                sample["image_url"] = _proxy_path(track["poster_url"])

        payload = {
            "algorithm": ALGORITHM,
            **_summary(track, meta),
            "method": method,
            "warning": warning,
            "source_url": source_url,
            "measured": (
                "Luminance, warmth (red minus blue), and contrast were measured "
                "from the SVS file named in source_url."
            ),
            "samples": samples,
        }
        cached.parent.mkdir(parents=True, exist_ok=True)
        cached.write_text(json.dumps(payload))
        return payload


async def _prewarm() -> None:
    await asyncio.sleep(0.5)
    for track in TRACKS:
        if track["kind"] != "video":
            continue
        try:
            await ensure_samples(track["svs_id"])
            log.info("prewarmed SVS %s", track["svs_id"])
        except Exception as exc:
            log.warning("prewarm failed for %s: %s", track["svs_id"], exc)


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True, "service": "synesthesia"}


@app.get("/api/jukebox")
async def jukebox() -> dict:
    # Titles are local. Descriptions are attached when already cached so the
    # list does not wait on nine SVS calls. Opening a frame loads the rest.
    meta = _read_meta()
    return {
        "source": "https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/",
        "gallery": "https://svs.gsfc.nasa.gov/gallery/earth-information-center/",
        "tracks": [_summary(track, meta.get(str(track["svs_id"]), {})) for track in TRACKS],
    }


@app.get("/api/jukebox/{svs_id}")
async def jukebox_track(svs_id: int) -> dict:
    payload = await ensure_samples(svs_id)
    payload["nasa_description"] = _clean_description(payload.get("nasa_description"))
    return payload


@app.get("/api/jukebox/{svs_id}/frame/{index}.jpg")
async def jukebox_frame(svs_id: int, index: int) -> FileResponse:
    path = (CACHE / "frames" / str(svs_id) / f"frame_{index:02d}.jpg").resolve()
    root = (CACHE / "frames").resolve()
    if root not in path.parents or not path.is_file():
        raise HTTPException(404, "That frame has not been sampled yet.")
    return FileResponse(path, media_type="image/jpeg")


@app.get("/api/media")
async def media(src: str = Query(..., description="https SVS file URL")) -> FileResponse:
    path = await download(src)
    media_type = "application/octet-stream"
    if path.suffix in {".jpg", ".jpeg"}:
        media_type = "image/jpeg"
    elif path.suffix == ".png":
        media_type = "image/png"
    elif path.suffix == ".webp":
        media_type = "image/webp"
    return FileResponse(path, media_type=media_type)


@app.get("/api/gibs/bluemarble")
async def bluemarble() -> Response:
    path = CACHE / "remote" / "bluemarble.jpg"
    if not path.exists() or path.stat().st_size < 1000:
        path.parent.mkdir(parents=True, exist_ok=True)
        client = _client_or_raise()
        try:
            response = await client.get(GIBS_BLUE_MARBLE)
            response.raise_for_status()
        except Exception as exc:
            raise HTTPException(
                502,
                f"NASA GIBS Blue Marble could not be loaded: {exc}",
            ) from exc
        if "image" not in response.headers.get("content-type", ""):
            raise HTTPException(502, "GIBS did not return an image.")
        path.write_bytes(response.content)
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


def _parse_day(value: str) -> datetime:
    if not re.fullmatch(r"\d{8}", value):
        raise HTTPException(400, f"Date {value} must be YYYYMMDD.")
    try:
        return datetime.strptime(value, "%Y%m%d")
    except ValueError as exc:
        raise HTTPException(400, f"Date {value} is not a real calendar day.") from exc


@app.get("/api/power")
async def power(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    start: str = Query(...),
    end: str = Query(...),
    parameters: str = Query(",".join(DEFAULT_PARAMETERS)),
) -> dict:
    names = list(dict.fromkeys(part.strip().upper() for part in parameters.split(",") if part.strip()))
    unknown = [name for name in names if name not in ALLOWED_PARAMETERS]
    if unknown:
        raise HTTPException(400, f"Unsupported POWER parameters: {', '.join(unknown)}")
    if not names:
        raise HTTPException(400, "Choose at least one POWER parameter.")
    start_day = _parse_day(start)
    end_day = _parse_day(end)
    span = (end_day - start_day).days
    if span < 0:
        raise HTTPException(400, "The end date is before the start date.")
    if span > 400:
        raise HTTPException(400, "Ask for 400 days or fewer so the request stays small.")

    query = {
        "parameters": ",".join(names),
        "community": "AG",
        "longitude": f"{lon:.4f}",
        "latitude": f"{lat:.4f}",
        "start": start,
        "end": end,
        "format": "JSON",
        "time-standard": "UTC",
    }
    cache_key = json.dumps(query, sort_keys=True)
    cached = _power_cache_get(cache_key)
    if cached is not None:
        return cached
    client = _client_or_raise()
    response = None
    last_error: Exception | None = None
    # One retry for a dropped connection or a 429/5xx; NASA's own 4xx messages are shown as they are.
    for attempt in range(2):
        try:
            response = await client.get(POWER_URL, params=query)
        except Exception as exc:
            last_error = exc
            response = None
        if response is not None and response.status_code not in (429, 500, 502, 503, 504):
            break
        if attempt == 0:
            await asyncio.sleep(1.5)
    if response is None:
        raise HTTPException(502, f"NASA POWER could not be reached: {last_error}")
    text = response.text
    try:
        payload = response.json()
    except Exception as exc:
        raise HTTPException(
            502,
            f"NASA POWER returned a non-JSON body ({response.status_code}): {text[:300]}",
        ) from exc
    if response.status_code >= 400:
        detail = ""
        if isinstance(payload, dict):
            detail = str(payload.get("message") or payload.get("reason") or payload.get("messages") or "")[:400]
        raise HTTPException(
            502,
            f"NASA POWER returned {response.status_code}. {detail}".strip(),
        )
    try:
        parsed = parse_power(payload)
    except ValueError as exc:
        raise HTTPException(502, str(exc)) from exc
    result = {
        "latitude": lat,
        "longitude": lon,
        "start": start,
        "end": end,
        "request_url": str(response.url),
        "source": "NASA POWER daily point (MERRA-2 / GEOS), community=AG",
        **parsed,
    }
    _power_cache_put(cache_key, result)
    return result


@app.get("/api/geocode")
async def geocode(q: str = Query(..., min_length=2, max_length=100)) -> dict:
    """Cached place lookup through Open-Meteo's free geocoding API."""
    query = " ".join(q.split())
    if len(query) < 2:
        raise HTTPException(400, "Enter at least two characters to search.")
    cache_key = query.casefold()
    path = CACHE / "geocoding" / (hashlib.sha256(cache_key.encode()).hexdigest()[:24] + ".json")
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:
            pass
    client = _client_or_raise()
    try:
        response = await client.get(GEOCODING_URL, params={"name": query, "count": 8, "language": "en", "format": "json"})
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:
        raise HTTPException(502, f"Place search could not be reached: {exc}") from exc
    results = []
    for item in payload.get("results", []):
        try:
            lat, lon = float(item["latitude"]), float(item["longitude"])
        except (KeyError, TypeError, ValueError):
            continue
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            continue
        parts = [item.get("name"), item.get("admin1"), item.get("country")]
        label = ", ".join(dict.fromkeys(part.strip() for part in parts if isinstance(part, str) and part.strip()))
        if label:
            results.append({"name": label, "latitude": lat, "longitude": lon})
    result = {"results": results, "source": "Open-Meteo Geocoding API"}
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(result))
    except OSError as exc:
        log.warning("Geocoding cache write failed: %s", exc)
    return result


POWER_CACHE = CACHE / "power"


def _power_cache_path(key: str) -> Path:
    return POWER_CACHE / (hashlib.sha256(key.encode()).hexdigest()[:24] + ".json")


def _power_cache_get(key: str) -> dict | None:
    """Only successful, parsed NASA answers are cached. Nothing is ever synthesised here."""
    path = _power_cache_path(key)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


def _power_cache_put(key: str, result: dict) -> None:
    try:
        POWER_CACHE.mkdir(exist_ok=True)
        _power_cache_path(key).write_text(json.dumps(result))
    except OSError as exc:
        log.warning("POWER cache write failed: %s", exc)


def _parameter_names(parameters: str) -> list[str]:
    names = list(dict.fromkeys(part.strip().upper() for part in parameters.split(",") if part.strip()))
    unknown = [name for name in names if name not in ALLOWED_PARAMETERS]
    if unknown:
        raise HTTPException(400, f"Unsupported POWER parameters: {', '.join(unknown)}")
    if not names:
        raise HTTPException(400, "Choose at least one POWER parameter.")
    return names


async def _fetch_power_parsed(url: str, query: dict) -> tuple[dict, str]:
    """GET one POWER document (one retry on a dropped connection or 429/5xx) and parse it."""
    client = _client_or_raise()
    response = None
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            response = await client.get(url, params=query, timeout=90)
        except Exception as exc:
            last_error = exc
            response = None
        if response is not None and response.status_code not in (429, 500, 502, 503, 504):
            break
        if attempt == 0:
            await asyncio.sleep(1.5)
    if response is None:
        raise HTTPException(502, f"NASA POWER could not be reached: {last_error}")
    try:
        payload = response.json()
    except Exception as exc:
        raise HTTPException(502, f"NASA POWER returned a non-JSON body ({response.status_code}): {response.text[:300]}") from exc
    if response.status_code >= 400:
        detail = ""
        if isinstance(payload, dict):
            detail = str(payload.get("message") or payload.get("reason") or payload.get("messages") or "")[:400]
        raise HTTPException(502, f"NASA POWER returned {response.status_code}. {detail}".strip())
    try:
        return parse_power(payload), str(response.url)
    except ValueError as exc:
        raise HTTPException(502, str(exc)) from exc


@app.get("/api/power/monthly")
async def power_monthly(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    start: int = Query(..., description="First year"),
    end: int = Query(..., description="Last year"),
    parameters: str = Query("T2M,PRECTOTCORR,RH2M"),
) -> dict:
    """Monthly means and annual values from the POWER monthly point API, for a place's history."""
    names = _parameter_names(parameters)
    this_year = datetime.now().year
    if start < MONTHLY_FIRST_YEAR or end > this_year:
        raise HTTPException(400, f"Choose years from {MONTHLY_FIRST_YEAR} to {this_year}.")
    if end < start:
        raise HTTPException(400, "The last year is before the first year.")
    if end - start + 1 > MONTHLY_MAX_YEARS:
        raise HTTPException(400, f"Ask for {MONTHLY_MAX_YEARS} years or fewer.")
    query = {
        "parameters": ",".join(names),
        "community": "AG",
        "longitude": f"{lon:.4f}",
        "latitude": f"{lat:.4f}",
        "start": str(start),
        "end": str(end),
        "format": "JSON",
    }
    cache_key = json.dumps({"monthly": query}, sort_keys=True)
    cached = _power_cache_get(cache_key)
    if cached is not None:
        return cached
    parsed, request_url = await _fetch_power_parsed(POWER_MONTHLY_URL, query)
    result = {
        "latitude": lat,
        "longitude": lon,
        "start": start,
        "end": end,
        "request_url": request_url,
        "source": "NASA POWER monthly and annual point (MERRA-2), community=AG",
        "units": parsed["units"],
        "longnames": parsed["longnames"],
        "messages": parsed["messages"],
        **split_monthly(parsed),
    }
    _power_cache_put(cache_key, result)
    return result


@app.get("/api/power/baseline")
async def power_baseline(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    parameters: str = Query(",".join(BASELINE_PARAMETERS)),
) -> dict:
    """Same-calendar-day statistics over POWER daily 2001–2020, for anomalies against normal."""
    names = _parameter_names(parameters)
    query = {
        "parameters": ",".join(names),
        "community": "AG",
        "longitude": f"{lon:.4f}",
        "latitude": f"{lat:.4f}",
        "start": f"{BASELINE_START_YEAR}0101",
        "end": f"{BASELINE_END_YEAR}1231",
        "format": "JSON",
        "time-standard": "UTC",
    }
    cache_key = json.dumps({"baseline": query, "half_window": BASELINE_HALF_WINDOW}, sort_keys=True)
    cached = _power_cache_get(cache_key)
    if cached is not None:
        return cached
    parsed, request_url = await _fetch_power_parsed(POWER_URL, query)
    result = {
        "latitude": lat,
        "longitude": lon,
        "period": [BASELINE_START_YEAR, BASELINE_END_YEAR],
        "half_window": BASELINE_HALF_WINDOW,
        "request_url": request_url,
        "source": f"NASA POWER daily point (MERRA-2 / GEOS), {BASELINE_START_YEAR}–{BASELINE_END_YEAR}, community=AG",
        "units": parsed["units"],
        "longnames": parsed["longnames"],
        "messages": parsed["messages"],
        "days": calendar_baseline(parsed),
    }
    _power_cache_put(cache_key, result)
    return result


# ---- Earth Listening Intelligence: a region sampled as a grid of POWER points ----

from app.region import REGION_PARAMETERS, RegionError, assemble, grid_points  # noqa: E402

# Grid points fetched from NASA POWER at once; the rest wait their turn.
REGION_CONCURRENCY = 4


def _region_years(start: int | None, end: int | None) -> tuple[int, int]:
    last_complete = datetime.now().year - 1
    first = MONTHLY_FIRST_YEAR if start is None else start
    last = last_complete if end is None else end
    if first < MONTHLY_FIRST_YEAR or last > datetime.now().year:
        raise HTTPException(400, f"Choose years from {MONTHLY_FIRST_YEAR} to {datetime.now().year}.")
    if last < first:
        raise HTTPException(400, "The last year is before the first year.")
    if last - first + 1 > MONTHLY_MAX_YEARS:
        raise HTTPException(400, f"Ask for {MONTHLY_MAX_YEARS} years or fewer.")
    return first, last


def _region_query(point: dict, start: int, end: int) -> dict:
    """The exact query /api/power/monthly sends, so both share one cache entry per point."""
    return {
        "parameters": ",".join(REGION_PARAMETERS),
        "community": "AG",
        "longitude": f"{point['lon']:.4f}",
        "latitude": f"{point['lat']:.4f}",
        "start": str(start),
        "end": str(end),
        "format": "JSON",
    }


def _region_grid(south: float, west: float, north: float, east: float) -> list[dict]:
    try:
        return grid_points(south, west, north, east)
    except RegionError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.get("/api/region/grid")
async def region_grid(
    south: float = Query(..., ge=-90, le=90),
    west: float = Query(..., ge=-180, le=180),
    north: float = Query(..., ge=-90, le=90),
    east: float = Query(..., ge=-180, le=180),
    start: int | None = Query(None),
    end: int | None = Query(None),
) -> dict:
    """The sampling plan: grid points, their weights, and which are already cached (for honest progress)."""
    first, last = _region_years(start, end)
    points = _region_grid(south, west, north, east)
    for point in points:
        query = _region_query(point, first, last)
        point["cached"] = _power_cache_get(json.dumps({"monthly": query}, sort_keys=True)) is not None
        point["request_url"] = f"{POWER_MONTHLY_URL}?{httpx.QueryParams(query)}"
    return {"start": first, "end": last, "parameters": list(REGION_PARAMETERS), "points": points}


@app.get("/api/region")
async def region(
    south: float = Query(..., ge=-90, le=90),
    west: float = Query(..., ge=-180, le=180),
    north: float = Query(..., ge=-90, le=90),
    east: float = Query(..., ge=-180, le=180),
    start: int | None = Query(None),
    end: int | None = Query(None),
) -> dict:
    """POWER monthly records at every grid point of a box, and their cos-latitude weighted area mean.

    Points are fetched REGION_CONCURRENCY at a time through the cached monthly
    proxy. A point that fails is listed under `failed`; the mean uses the rest.
    """
    first, last = _region_years(start, end)
    points = _region_grid(south, west, north, east)
    gate = asyncio.Semaphore(REGION_CONCURRENCY)

    async def one(point: dict) -> dict | Exception:
        async with gate:
            try:
                return await power_monthly(
                    lat=point["lat"], lon=point["lon"], start=first, end=last, parameters=",".join(REGION_PARAMETERS)
                )
            except Exception as exc:  # reported per point, never hidden
                exc.request_url = f"{POWER_MONTHLY_URL}?{httpx.QueryParams(_region_query(point, first, last))}"  # type: ignore[attr-defined]
                return exc

    results = await asyncio.gather(*(one(point) for point in points))
    try:
        return assemble({"south": south, "west": west, "north": north, "east": east}, first, last, points, list(results))
    except RegionError as exc:
        raise HTTPException(502, str(exc)) from exc
