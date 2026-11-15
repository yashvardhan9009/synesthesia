"""Region grid, area mean and the /api/region endpoint (SYNTHETIC values, not NASA observations)."""

import math

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main
from app.region import area_mean, assemble, grid_points, grid_shape, validate_box, RegionError


def test_grid_shapes_for_the_presets():
    assert grid_shape(-20, 55, 10, 95) == (3, 4)  # Indian Ocean
    assert grid_shape(10, -15, 18, 35) == (3, 4)  # Sahel
    assert grid_shape(-12, -72, 2, -50) == (3, 3)  # Amazon
    assert grid_shape(70, -180, 85, 180) == (2, 6)  # Arctic: spread around the pole
    assert grid_shape(40, 10, 44, 14) == (3, 3)  # a small geocoded box


def test_grid_points_are_cell_centres_with_cos_latitude_weights():
    points = grid_points(-20, 55, 10, 95)
    assert len(points) == 12
    assert points[0]["lat"] == 5.0 and points[0]["lon"] == 60.0  # north-west first
    assert points[-1]["lat"] == -15.0 and points[-1]["lon"] == 90.0
    assert math.isclose(points[0]["weight"], math.cos(math.radians(5)), rel_tol=1e-6)
    arctic = grid_points(70, -180, 85, 180)
    assert [p["lon"] for p in arctic[:6]] == [-150.0, -90.0, -30.0, 30.0, 90.0, 150.0]
    assert all(p["lat"] in (81.25, 73.75) for p in arctic)


@pytest.mark.parametrize("box", [(10, 0, 5, 10), (0, 10, 5, 0), (0, 0, 0.5, 10), (-40, 0, 30, 10), (0, -190, 5, 10)])
def test_validate_box_rejects_bad_boxes(box):
    with pytest.raises(RegionError):
        validate_box(*box)


def test_area_mean_weights_by_latitude_and_skips_missing():
    means, counts = area_mean([[10.0, None, None], [20.0, 5.0, None]], [1.0, 3.0])
    assert means[0] == 17.5  # (10·1 + 20·3) / 4
    assert means[1] == 5.0  # 3 of 4 weight present
    assert means[2] is None
    assert counts == [2, 1, 0]
    low, _ = area_mean([[1.0], [None]], [1.0, 3.0])
    assert low == [None]  # only a quarter of the weight: missing, not guessed


def test_assemble_reports_failures_and_drops_unpublished_trailing_months():
    points = grid_points(-20, 55, 10, 95)[:2]
    doc = {"request_url": "https://power.example/1", "units": {"T2M": "C"},
           "monthly": {"T2M": [{"date": "202001", "value": 25.0}, {"date": "202002", "value": 26.0}]}}
    out = assemble({"south": -20, "west": 55, "north": 10, "east": 95}, 2020, 2020, points, [doc, RuntimeError("down")])
    assert out["months"] == ["202001", "202002"]
    assert out["mean"]["T2M"] == [25.0, 26.0]
    assert out["mean"]["PRECTOTCORR"] == [None, None]
    assert out["failed"][0]["error"] == "down"
    assert out["request_urls"] == ["https://power.example/1"]
    with pytest.raises(RegionError):
        assemble({}, 2020, 2020, points, [RuntimeError("a"), RuntimeError("b")])


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "POWER_CACHE", tmp_path / "power")
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url)
        lat = float(request.url.params["latitude"])
        if lat < -10:  # the southern row fails
            return httpx.Response(422, json={"message": "SYNTHETIC failure"})
        values = {f"{year}{month:02d}": 20.0 + lat / 10 for year in (1981, 1982) for month in range(1, 13)}
        values["198213"] = 99.0
        values["198206"] = -999
        params = {name: dict(values) for name in ("T2M", "PRECTOTCORR", "WS2M", "RH2M")}
        return httpx.Response(200, json={
            "header": {"title": "SYNTHETIC fixture", "fill_value": -999},
            "messages": [],
            "parameters": {"T2M": {"units": "C"}},
            "properties": {"parameter": params},
        })

    main._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    yield TestClient(main.app), seen
    main._client = None


BOX = {"south": -20, "west": 55, "north": 10, "east": 95, "start": 1981, "end": 1982}


def test_region_endpoint_samples_the_grid_and_reports_failed_points(client):
    test, seen = client
    response = test.get("/api/region", params=BOX)
    assert response.status_code == 200
    body = response.json()
    assert body["requested"] == 12
    assert len(body["points"]) == 8 and len(body["failed"]) == 4
    assert all("monthly/point" in url and "parameters=T2M" in url for url in body["request_urls"])
    assert all(item["request_url"] and "latitude=-15.0000" in item["request_url"] for item in body["failed"])
    assert len(body["months"]) == 24
    assert body["mean"]["T2M"][17] is None  # the fill value stays missing
    w5, wm5 = math.cos(math.radians(5)), math.cos(math.radians(-5))
    expected = (w5 * 20.5 + wm5 * 19.5) / (w5 + wm5)
    assert math.isclose(body["mean"]["T2M"][0], expected, abs_tol=1e-3)
    assert body["coverage"]["T2M"][0] == 8
    calls = len(seen)
    # The successful points are cached on disk; only the failed ones are asked again.
    assert test.get("/api/region", params=BOX).status_code == 200
    assert len(seen) - calls == 4  # 422 is not retried


def test_region_grid_reports_cache_state_and_validates(client):
    test, _ = client
    assert test.get("/api/region/grid", params={**BOX, "north": -30}).status_code == 400
    plan = test.get("/api/region/grid", params=BOX).json()
    assert len(plan["points"]) == 12 and not any(point["cached"] for point in plan["points"])
    test.get("/api/region", params=BOX)
    plan = test.get("/api/region/grid", params=BOX).json()
    assert sum(point["cached"] for point in plan["points"]) == 8
    assert plan["points"][0]["request_url"].startswith("https://power.larc.nasa.gov/api/temporal/monthly/point?")


def test_region_endpoint_fails_clearly_when_every_point_fails(client):
    test, _ = client
    response = test.get("/api/region", params={**BOX, "south": -40, "north": -12})
    assert response.status_code == 502
    assert "none of the" in response.json()["detail"]


def test_large_responses_are_gzipped(client):
    test, _ = client
    big = test.get("/api/region", params={**BOX, "start": 1981, "end": 1982}, headers={"Accept-Encoding": "gzip"})
    assert big.status_code == 200
    assert big.headers.get("content-encoding") == "gzip"
    assert int(big.headers["content-length"]) < len(big.content)  # httpx decoded it; the wire size is smaller
    small = test.get("/api/region/grid", params={**BOX, "north": -30}, headers={"Accept-Encoding": "gzip"})
    assert small.headers.get("content-encoding") is None  # tiny error bodies stay plain
    plain = test.get("/api/region", params=BOX, headers={"Accept-Encoding": "identity"})
    assert plain.headers.get("content-encoding") is None
