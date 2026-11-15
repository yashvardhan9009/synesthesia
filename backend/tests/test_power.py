"""SYNTHETIC POWER-shaped JSON. Not a NASA observation."""

import pytest

from app.power import parse_power


def _payload():
    return {
        "header": {"title": "SYNTHETIC fixture", "fill_value": -999},
        "messages": [],
        "parameters": {
            "T2M": {"units": "C", "longname": "Temperature at 2 Meters"},
        },
        "properties": {
            "parameter": {
                "T2M": {
                    "20260601": 31.5,
                    "20260602": -999,
                    "20260603": 33.0,
                }
            }
        },
        "geometry": {"coordinates": [77.2, 28.6, 0]},
    }


def test_fill_values_become_null_and_units_are_kept():
    parsed = parse_power(_payload())
    values = [point["value"] for point in parsed["parameters"]["T2M"]]
    assert values == [31.5, None, 33.0]
    assert parsed["units"]["T2M"] == "C"
    assert parsed["dates"] == ["20260601", "20260602", "20260603"]


def test_error_body_is_raised_not_filled_in():
    with pytest.raises(ValueError, match="outside the archive"):
        parse_power({"message": "Date outside the archive", "reason": "bad"})
