"""The POWER proxy endpoint against a mocked NASA (SYNTHETIC bodies, not NASA observations)."""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main


def _body(values):
    return {
        "header": {"title": "SYNTHETIC fixture", "fill_value": -999},
        "messages": [],
        "parameters": {"PS": {"units": "kPa", "longname": "Surface Pressure"}},
        "properties": {"parameter": {"PS": values}},
        "geometry": {"coordinates": [1, 2, 0]},
    }


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "POWER_CACHE", tmp_path / "power")
    calls = {"n": 0, "status": [200]}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        status = calls["status"].pop(0) if calls["status"] else 200
        if status != 200:
            return httpx.Response(status, json={"message": "SYNTHETIC failure"})
        return httpx.Response(200, json=_body({"20260601": 98.1, "20260602": -999}))

    async def no_sleep(_):
        return None

    monkeypatch.setattr(main.asyncio, "sleep", no_sleep)
    main._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    yield TestClient(main.app), calls
    main._client = None


def test_new_parameters_are_allowed_and_fill_stays_missing(client):
    test, calls = client
    response = test.get("/api/power", params={"lat": 1, "lon": 2, "start": "20260601", "end": "20260602", "parameters": "PS,CLOUD_AMT"})
    assert response.status_code == 200
    body = response.json()
    assert [p["value"] for p in body["parameters"]["PS"]] == [98.1, None]
    assert body["units"]["PS"] == "kPa"


def test_unknown_parameter_is_rejected(client):
    test, _ = client
    response = test.get("/api/power", params={"lat": 1, "lon": 2, "start": "20260601", "end": "20260602", "parameters": "FAKE"})
    assert response.status_code == 400


def test_bad_dates_are_rejected(client):
    test, _ = client
    assert test.get("/api/power", params={"lat": 1, "lon": 2, "start": "20260231", "end": "20260302"}).status_code == 400
    assert test.get("/api/power", params={"lat": 1, "lon": 2, "start": "20260602", "end": "20260601"}).status_code == 400
    assert test.get("/api/power", params={"lat": 91, "lon": 2, "start": "20260601", "end": "20260602"}).status_code == 422


def test_transient_failure_is_retried_once_then_cached(client):
    test, calls = client
    calls["status"] = [503]
    params = {"lat": 1, "lon": 2, "start": "20260601", "end": "20260602", "parameters": "PS"}
    assert test.get("/api/power", params=params).status_code == 200
    assert calls["n"] == 2
    assert test.get("/api/power", params=params).status_code == 200
    assert calls["n"] == 2  # second answer came from the cache


def test_nasa_error_is_passed_through_not_filled(client):
    test, calls = client
    calls["status"] = [400]
    response = test.get("/api/power", params={"lat": 1, "lon": 2, "start": "20260601", "end": "20260602", "parameters": "PS"})
    assert response.status_code == 502
    assert "SYNTHETIC failure" in json.dumps(response.json())


def test_geocode_proxies_and_caches_valid_results(client, monkeypatch, tmp_path):
    test, calls = client
    monkeypatch.setattr(main, "CACHE", tmp_path)

    async def fake_get(url, params):
        calls["n"] += 1
        assert "geocoding-api.open-meteo.com" in url
        return httpx.Response(200, request=httpx.Request("GET", url), json={"results": [
            {"name": "Reykjavík", "admin1": "Capital Region", "country": "Iceland", "latitude": 64.1466, "longitude": -21.9426},
            {"name": "Invalid", "latitude": 999, "longitude": 0},
        ]})

    monkeypatch.setattr(main._client, "get", fake_get)
    first = test.get("/api/geocode", params={"q": "  Reykjavik "})
    second = test.get("/api/geocode", params={"q": "Reykjavik"})
    assert first.status_code == second.status_code == 200
    assert first.json()["results"] == [{"name": "Reykjavík, Capital Region, Iceland", "latitude": 64.1466, "longitude": -21.9426}]
    assert calls["n"] == 1


def test_geocode_rejects_short_queries(client):
    test, _ = client
    assert test.get("/api/geocode", params={"q": "a"}).status_code == 422
