"""Routes API client: route matrices for leg times and per-leg routes for map polylines."""

import math
from typing import Protocol

import httpx

from app.contracts.travel import LegMode
from app.integrations.places.google_client import GoogleAPIError, _raise_for

MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"
ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
TRAVEL_MODE: dict[str, str] = {"walk": "WALK", "transit": "TRANSIT", "drive": "DRIVE"}


class LatLngLike(Protocol):
    lat: float
    lng: float


def _waypoint(p: LatLngLike) -> dict:
    return {"location": {"latLng": {"latitude": p.lat, "longitude": p.lng}}}


def parse_duration_s(value: str | None) -> float | None:
    if not value or not value.endswith("s"):
        return None
    return float(value[:-1])


class GoogleRoutesClient:
    def __init__(self, api_key: str, http: httpx.AsyncClient | None = None):
        self._key = api_key
        self._http = http or httpx.AsyncClient(timeout=20)

    def _headers(self, fields: str) -> dict[str, str]:
        return {"X-Goog-Api-Key": self._key, "X-Goog-FieldMask": fields, "Content-Type": "application/json"}

    async def pair_times(self, pairs: list[tuple[LatLngLike, LatLngLike]], mode: LegMode) -> list[tuple[int, float] | None]:
        """(minutes, km) for each (origin, destination) pair, read off the diagonal of one route matrix."""
        if not pairs:
            return []
        body: dict = {
            "origins": [{"waypoint": _waypoint(a)} for a, _ in pairs],
            "destinations": [{"waypoint": _waypoint(b)} for _, b in pairs],
            "travelMode": TRAVEL_MODE[mode],
        }
        resp = await self._http.post(MATRIX_URL, json=body, headers=self._headers("originIndex,destinationIndex,duration,distanceMeters,condition"))
        _raise_for(resp)
        out: list[tuple[int, float] | None] = [None] * len(pairs)
        for el in resp.json():
            i, j = el.get("originIndex", 0), el.get("destinationIndex", 0)
            if i != j or el.get("condition") != "ROUTE_EXISTS":
                continue
            seconds = parse_duration_s(el.get("duration"))
            if seconds is None:
                continue
            out[i] = (max(1, math.ceil(seconds / 60)), round(el.get("distanceMeters", 0) / 1000, 1))
        return out

    async def leg_polyline(self, a: LatLngLike, b: LatLngLike, mode: LegMode) -> str | None:
        body = {"origin": _waypoint(a), "destination": _waypoint(b), "travelMode": TRAVEL_MODE[mode], "polylineQuality": "OVERVIEW"}
        resp = await self._http.post(ROUTES_URL, json=body, headers=self._headers("routes.polyline.encodedPolyline"))
        try:
            _raise_for(resp)
        except GoogleAPIError:
            return None
        routes = resp.json().get("routes") or []
        return routes[0].get("polyline", {}).get("encodedPolyline") if routes else None

    async def aclose(self) -> None:
        await self._http.aclose()
