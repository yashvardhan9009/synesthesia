"""Monthly splitting and the same-calendar-day baseline (SYNTHETIC values, not NASA observations)."""

import math

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main
from app.history import calendar_baseline, leap_day_index, split_monthly


def test_split_monthly_separates_annual_month_13_and_keeps_missing():
    parsed = {"parameters": {"T2M": [
        {"date": "202401", "value": 12.0},
        {"date": "202402", "value": None},
        {"date": "202413", "value": 25.5},
        {"date": "202501", "value": 13.0},
    ]}}
    out = split_monthly(parsed)
    assert out["monthly"]["T2M"] == [
        {"date": "202401", "value": 12.0},
        {"date": "202402", "value": None},
        {"date": "202501", "value": 13.0},
    ]
    assert out["annual"]["T2M"] == [{"date": "2024", "value": 25.5}]
    assert out["months"] == ["202401", "202402", "202501"]
    assert out["years"] == ["2024"]


def test_leap_day_index_gives_29_february_its_own_slot():
    assert leap_day_index(1, 1) == 0
    assert leap_day_index(2, 29) == 59
    assert leap_day_index(3, 1) == 60
    assert leap_day_index(12, 31) == 365


def test_calendar_baseline_pools_the_window_and_wraps_new_year():
    points = [
        {"date": "20011231", "value": 10.0},
        {"date": "20020101", "value": 20.0},
        {"date": "20020102", "value": None},
        {"date": "20020601", "value": 99.0},
    ]
    days = calendar_baseline({"parameters": {"T2M": points}}, half_window=1)["T2M"]
    assert days["0101"]["n"] == 2
    assert days["0101"]["mean"] == 15.0
    assert math.isclose(days["0101"]["sd"], math.sqrt(50), rel_tol=1e-3)
    assert days["1231"]["n"] == 2  # 31 Dec and 1 Jan
    assert days["0601"]["mean"] == 99.0
    assert "0301" not in days  # nothing observed near 1 March: no invented baseline


def test_calendar_baseline_rain_adds_log_scale_and_wet_fraction():
    points = [{"date": f"200101{day:02d}", "value": value} for day, value in [(1, 0.0), (2, 0.0), (3, 4.0), (4, 9.0)]]
    day = calendar_baseline({"parameters": {"PRECTOTCORR": points}}, half_window=3)["PRECTOTCORR"]["0102"]
    assert day["n"] == 4
    assert day["wet"] == 0.5
    assert math.isclose(day["log_mean"], (math.log(5) + math.log(10)) / 4, rel_tol=1e-3)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "POWER_CACHE", tmp_path / "power")
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url)
        if "monthly" in request.url.path:
            values = {"202001": 1.5, "202002": -999, "202013": 3.0}
        else:
            values = {"20010101": 5.0, "20200101": 7.0}
        return httpx.Response(200, json={
            "header": {"title": "SYNTHETIC fixture", "fill_value": -999},
            "messages": [],
            "parameters": {"T2M": {"units": "C", "longname": "Temperature at 2 Meters"}},
            "properties": {"parameter": {"T2M": values}},
        })

    main._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    yield TestClient(main.app), seen
    main._client = None


def test_monthly_endpoint_validates_and_splits(client):
    test, seen = client
    assert test.get("/api/power/monthly", params={"lat": 1, "lon": 2, "start": 1970, "end": 2020}).status_code == 400
    assert test.get("/api/power/monthly", params={"lat": 1, "lon": 2, "start": 2021, "end": 2020}).status_code == 400
    response = test.get("/api/power/monthly", params={"lat": 1, "lon": 2, "start": 2020, "end": 2020, "parameters": "T2M"})
    assert response.status_code == 200
    body = response.json()
    assert body["monthly"]["T2M"] == [{"date": "202001", "value": 1.5}, {"date": "202002", "value": None}]
    assert body["annual"]["T2M"] == [{"date": "2020", "value": 3.0}]
    assert "monthly/point" in str(seen[0])


def test_baseline_endpoint_asks_for_2001_to_2020(client):
    test, seen = client
    response = test.get("/api/power/baseline", params={"lat": 1, "lon": 2, "parameters": "T2M"})
    assert response.status_code == 200
    body = response.json()
    assert body["period"] == [2001, 2020]
    assert body["days"]["T2M"]["0101"]["n"] == 2
    assert body["days"]["T2M"]["0101"]["mean"] == 6.0
    assert seen[0].params["start"] == "20010101" and seen[0].params["end"] == "20201231"
