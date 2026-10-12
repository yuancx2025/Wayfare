"""Thin async client for Places API (New). Every call sends an explicit field mask to keep billing at the right SKU."""

from typing import Any

import httpx

from app.core.exceptions import UpstreamError

BASE = "https://places.googleapis.com/v1"

PLACE_FIELDS = [
    "id", "displayName", "types", "primaryType", "location", "priceLevel", "rating", "userRatingCount",
    "regularOpeningHours", "editorialSummary", "photos", "shortFormattedAddress", "addressComponents", "businessStatus",
]
DETAIL_FIELDS = PLACE_FIELDS + ["websiteUri", "googleMapsUri", "currentOpeningHours", "utcOffsetMinutes"]
DESTINATION_FIELDS = ["id", "displayName", "location", "viewport", "photos", "addressComponents", "formattedAddress", "types", "editorialSummary"]


class GoogleAPIError(UpstreamError):
    def __init__(self, status: int, message: str):
        super().__init__(f"Google API error {status}: {message}")
        self.status = status


def _raise_for(resp: httpx.Response) -> None:
    if resp.is_success:
        return
    try:
        message = resp.json().get("error", {}).get("message", resp.text)
    except ValueError:
        message = resp.text
    raise GoogleAPIError(resp.status_code, message)


class GooglePlacesClient:
    def __init__(self, api_key: str, http: httpx.AsyncClient | None = None):
        self._key = api_key
        self._http = http or httpx.AsyncClient(timeout=15)

    def _headers(self, fields: list[str] | None = None, prefix: str = "") -> dict[str, str]:
        h = {"X-Goog-Api-Key": self._key, "Content-Type": "application/json"}
        if fields:
            h["X-Goog-FieldMask"] = ",".join(f"{prefix}{f}" for f in fields)
        return h

    async def autocomplete(self, text: str, session_token: str | None = None, primary_types: list[str] | None = None, bias: dict | None = None) -> list[dict]:
        body: dict[str, Any] = {"input": text}
        if session_token:
            body["sessionToken"] = session_token
        if primary_types:
            body["includedPrimaryTypes"] = primary_types
        if bias:
            body["locationBias"] = bias
        resp = await self._http.post(f"{BASE}/places:autocomplete", json=body, headers=self._headers())
        _raise_for(resp)
        return [s["placePrediction"] for s in resp.json().get("suggestions", []) if "placePrediction" in s]

    async def details(self, place_id: str, fields: list[str] = DETAIL_FIELDS, session_token: str | None = None) -> dict:
        params = {"sessionToken": session_token} if session_token else None
        resp = await self._http.get(f"{BASE}/places/{place_id}", params=params, headers=self._headers(fields))
        _raise_for(resp)
        return resp.json()

    async def text_search(self, query: str, *, bias: dict | None = None, included_type: str | None = None, page_size: int = 20, fields: list[str] = PLACE_FIELDS) -> list[dict]:
        body: dict[str, Any] = {"textQuery": query, "pageSize": page_size}
        if bias:
            body["locationBias"] = bias
        if included_type:
            body["includedType"] = included_type
        resp = await self._http.post(f"{BASE}/places:searchText", json=body, headers=self._headers(fields, "places."))
        _raise_for(resp)
        return resp.json().get("places", [])

    async def nearby_search(self, lat: float, lng: float, radius_m: float, included_types: list[str], *, max_results: int = 20, fields: list[str] = PLACE_FIELDS) -> list[dict]:
        body = {
            "includedTypes": included_types,
            "maxResultCount": max_results,
            "rankPreference": "POPULARITY",
            "locationRestriction": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": radius_m}},
        }
        resp = await self._http.post(f"{BASE}/places:searchNearby", json=body, headers=self._headers(fields, "places."))
        _raise_for(resp)
        return resp.json().get("places", [])

    async def photo_uri(self, photo_name: str, max_width: int = 1000) -> str:
        """Resolves a photo resource name to a short-lived, key-less image URL."""
        resp = await self._http.get(
            f"{BASE}/{photo_name}/media", params={"maxWidthPx": max_width, "skipHttpRedirect": "true"}, headers=self._headers(),
        )
        _raise_for(resp)
        return resp.json()["photoUri"]

    async def aclose(self) -> None:
        await self._http.aclose()


def circle(lat: float, lng: float, radius_m: float) -> dict:
    return {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": radius_m}}


def rectangle(low_lat: float, low_lng: float, high_lat: float, high_lng: float) -> dict:
    return {"rectangle": {"low": {"latitude": low_lat, "longitude": low_lng}, "high": {"latitude": high_lat, "longitude": high_lng}}}
