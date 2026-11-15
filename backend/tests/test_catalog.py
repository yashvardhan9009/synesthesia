from app.catalog import TRACKS

# Named, in order, on the Space Apps resources tab for The Earth Information Jukebox
# (checked 14 Nov 2026).
OFFICIAL_IDS = [5313, 3912, 5669, 5533, 5425, 5196, 5011, 4960, 4950]


def test_jukebox_is_the_nine_official_frames_in_resource_order():
    assert [track["svs_id"] for track in TRACKS] == OFFICIAL_IDS
    assert len({track["svs_id"] for track in TRACKS}) == 9
    for track in TRACKS:
        assert track["page_url"].startswith("https://svs.gsfc.nasa.gov/")
        assert track["media_url"].startswith("https://svs.gsfc.nasa.gov/vis/")
        assert track["pitch_from"] in {"luminance", "warmth", "contrast"}
