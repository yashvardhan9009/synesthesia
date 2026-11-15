"""SYNTHETIC images only. These are not NASA observations."""

from app.analyze import spatial_samples


def test_spatial_scan_reads_brightness_from_west_to_east():
    from PIL import Image

    image = Image.new("RGB", (80, 40), "black")
    # Right half is white. A west-to-east scan must rise.
    for x in range(40, 80):
        for y in range(40):
            image.putpixel((x, y), (255, 255, 255))
    import io

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    samples = spatial_samples(buffer.getvalue(), columns=4)
    assert [round(sample["luminance"], 2) for sample in samples] == [0.0, 0.0, 1.0, 1.0]
    assert samples[0]["label"].startswith("West-to-east")
    assert samples[-1]["warmth"] == samples[0]["warmth"]


def test_warmth_separates_red_from_blue():
    from PIL import Image
    import io

    red = Image.new("RGB", (16, 16), (220, 40, 20))
    blue = Image.new("RGB", (16, 16), (20, 40, 220))
    red_buf, blue_buf = io.BytesIO(), io.BytesIO()
    red.save(red_buf, format="PNG")
    blue.save(blue_buf, format="PNG")
    red_sample = spatial_samples(red_buf.getvalue(), columns=1)[0]
    blue_sample = spatial_samples(blue_buf.getvalue(), columns=1)[0]
    assert red_sample["warmth"] > 0.7
    assert blue_sample["warmth"] < 0.3
