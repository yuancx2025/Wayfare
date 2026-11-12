"""Routes API client: one computeRoutes request per leg returns its time, distance and map polyline."""

import math
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.contracts.travel import LegMode
from app.integrations.places.google_client import _raise_for

ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
ROUTE_FIELDS = "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline"
TRAVEL_MODE: dict[str, str] = {"walk": "WALK", "transit": "TRANSIT", "drive": "DRIVE"}


class LatLngLike(Protocol):
    lat: float
    lng: float


@dataclass(frozen=True)
class RouteLeg:
    minutes: int
    km: float
    polyline: str | None


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

    async def leg(self, a: LatLngLike, b: LatLngLike, mode: LegMode) -> RouteLeg | None:
        """Time, distance and overview polyline for one leg, or None when Google finds no route.

        A route matrix bills origins x destinations, so reading k consecutive legs off its diagonal costs k^2 elements.
        One request per leg costs k, and the same request carries the polyline the day map needs.
        """
        body = {"origin": _waypoint(a), "destination": _waypoint(b), "travelMode": TRAVEL_MODE[mode], "polylineQuality": "OVERVIEW"}
        resp = await self._http.post(ROUTES_URL, json=body, headers=self._headers(ROUTE_FIELDS))
        _raise_for(resp)
        routes = resp.json().get("routes") or []
        seconds = parse_duration_s(routes[0].get("duration")) if routes else None
        if seconds is None:
            return None
        return RouteLeg(
            minutes=max(1, math.ceil(seconds / 60)),
            km=round(routes[0].get("distanceMeters", 0) / 1000, 1),
            polyline=routes[0].get("polyline", {}).get("encodedPolyline"),
        )

    async def aclose(self) -> None:
        await self._http.aclose()
