"""Measure real SVS frames. No synthetic stand-in for a failed download."""

from __future__ import annotations

import math
from io import BytesIO
from typing import Any

from PIL import Image

LUMA = (0.2126, 0.7152, 0.0722)


def _mean(values: list[float]) -> float:
    return sum(values) / len(values)


def _stats(pixels: list[tuple[int, int, int]]) -> dict[str, float]:
    lums: list[float] = []
    reds: list[float] = []
    greens: list[float] = []
    blues: list[float] = []
    for red, green, blue in pixels:
        reds.append(red / 255)
        greens.append(green / 255)
        blues.append(blue / 255)
        lums.append((LUMA[0] * red + LUMA[1] * green + LUMA[2] * blue) / 255)
    lum = _mean(lums)
    variance = sum((value - lum) ** 2 for value in lums) / len(lums)
    mean_red = _mean(reds)
    mean_blue = _mean(blues)
    return {
        "luminance": lum,
        "warmth": min(1.0, max(0.0, (mean_red - mean_blue + 1) / 2)),
        "contrast": min(1.0, math.sqrt(variance) / 0.5),
        "red": mean_red,
        "green": _mean(greens),
        "blue": mean_blue,
    }


def spatial_samples(image_bytes: bytes, columns: int = 24) -> list[dict[str, Any]]:
    """SYNTHETIC images are allowed only in tests. Production passes SVS bytes."""
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    small = image.resize((columns, 64), Image.Resampling.BOX)
    samples: list[dict[str, Any]] = []
    for index in range(columns):
        pixels = [small.getpixel((index, y)) for y in range(small.height)]
        stats = _stats(pixels)  # type: ignore[arg-type]
        samples.append(
            {
                "index": index,
                "label": f"West-to-east slice {index + 1} of {columns}",
                "playhead": (index + 0.5) / columns,
                **stats,
            }
        )
    return samples


def frame_sample(image_bytes: bytes, index: int, total: int) -> dict[str, Any]:
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    small = image.resize((64, 36), Image.Resampling.BOX)
    pixels = list(small.getdata())
    stats = _stats(pixels)
    return {
        "index": index,
        "label": f"Frame {index + 1} of {total}",
        "playhead": None,
        **stats,
    }
