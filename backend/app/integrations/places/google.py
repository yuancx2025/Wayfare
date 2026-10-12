"""Place provider backed by Places API (New), with every response cached in `place_cache`."""

import asyncio
import hashlib
from typing import Literal

from app.contracts.travel import Category, Destination, Place, PlaceDetails, Preferences, Suggestion
from app.core.ids import slugify
from app.domain.scheduler import distance_km
from app.integrations.cache import PlaceCache, cache_key
from app.integrations.places import normalize
from app.integrations.places.google_client import DESTINATION_FIELDS, DETAIL_FIELDS, GoogleAPIError, GooglePlacesClient, circle, rectangle

MAX_CANDIDATE_DISTANCE_KM = 25


class GooglePlaceProvider:
    source: Literal["google"] = "google"

    def __init__(self, client: GooglePlacesClient, cache: PlaceCache):
        self._g = client
        self._cache = cache

    async def _cached(self, key: str, fetch, ttl_s: int | None = None):
        hit = await self._cache.get(key)
        if hit is not None:
            return hit
        value = await fetch()
        await self._cache.set(key, value, ttl_s)
        return value

    async def autocomplete(self, q: str, session_token: str | None = None) -> list[Suggestion]:
        if not q.strip():
            return []
        preds = await self._g.autocomplete(q, session_token, primary_types=["(cities)"])
        return [
            Suggestion(
                place_id=p["placeId"], name=p.get("structuredFormat", {}).get("mainText", {}).get("text") or p.get("text", {}).get("text", ""),
                secondary=p.get("structuredFormat", {}).get("secondaryText", {}).get("text", ""), source="google",
            )
            for p in preds
        ]

    def _to_destination(self, g: dict) -> Destination:
        name = g.get("displayName", {}).get("text", "place")
        image = f"/places/{g['id']}/photo?maxWidth=1000" if g.get("photos") else ""
        return normalize.to_destination(g, f"{slugify(name)}-{hashlib.sha1(g['id'].encode()).hexdigest()[:6]}", image)

    async def resolve_destination(self, place_id: str) -> Destination | None:
        g = await self._cached(cache_key("dest", place_id), lambda: self._g.details(place_id, DESTINATION_FIELDS))
        return self._to_destination(g) if g.get("location") else None

    async def search_destinations(self, q: str, limit: int = 5) -> list[Destination]:
        if not q.strip():
            return []
        results = await self._cached(
            cache_key("cities", q.lower(), limit),
            lambda: self._g.text_search(q, included_type="locality", page_size=limit, fields=DESTINATION_FIELDS),
        )
        return [self._to_destination(g) for g in results if g.get("location")]

    def _bias(self, dest: Destination) -> dict:
        if dest.viewport:
            v = dest.viewport
            return rectangle(v.low.lat, v.low.lng, v.high.lat, v.high.lng)
        return circle(dest.center.lat, dest.center.lng, 8000)

    async def _search(self, query: str, bias: dict, page_size: int) -> list[dict]:
        return await self._cached(cache_key("ts", query, bias, page_size), lambda: self._g.text_search(query, bias=bias, page_size=page_size))

    async def candidates(self, dest: Destination, prefs: Preferences) -> list[Place]:
        bias = self._bias(dest)
        city = f"{dest.name}, {dest.country}" if dest.country else dest.name
        jobs: list[tuple[str, Category, str | None, int]] = []
        for interest in prefs.interests:
            jobs.append((normalize.INTEREST_QUERIES[interest].format(city=city), interest, None, 20))
        for food in prefs.food[:3] or []:
            jobs.append((normalize.FOOD_QUERIES[food].format(city=city), "food", food, 12))
        if not prefs.food:
            jobs.append((f"popular restaurants in {city}", "food", None, 12))

        results = await asyncio.gather(*(self._search(q, bias, size) for q, _, _, size in jobs))
        seen: set[str] = set()
        out: list[Place] = []
        for (_, hint, food_hint, _), raw in zip(jobs, results):
            for g in raw:
                p = normalize.to_place(g, hint, food_hint)  # type: ignore[arg-type]
                if p and p.id not in seen and distance_km(dest.center, p) <= MAX_CANDIDATE_DISTANCE_KM:
                    seen.add(p.id)
                    out.append(p)
        return out

    async def nearby(self, dest: Destination, center: tuple[float, float], categories: list[Category] | None, radius_m: float) -> list[Place]:
        cats: list[Category] = categories or ["culture", "museums", "nature", "architecture"]
        types = sorted({t for c in cats for t in normalize.NEARBY_TYPES[c]})
        lat, lng = center
        raw = await self._cached(
            cache_key("nearby", round(lat, 4), round(lng, 4), radius_m, types),
            lambda: self._g.nearby_search(lat, lng, radius_m, types),
        )
        hint = cats[0] if len(cats) == 1 else None
        return [p for g in raw if (p := normalize.to_place(g, hint))]

    async def _details_raw(self, place_id: str) -> dict:
        return await self._cached(cache_key("details", place_id), lambda: self._g.details(place_id, DETAIL_FIELDS))

    async def get_place(self, place_id: str) -> Place | None:
        try:
            return normalize.to_place(await self._details_raw(place_id))
        except GoogleAPIError as e:
            if e.status == 404:
                return None
            raise

    async def details(self, place_id: str) -> PlaceDetails | None:
        try:
            g = await self._details_raw(place_id)
        except GoogleAPIError as e:
            if e.status in (400, 404):
                return None
            raise
        return PlaceDetails(
            place_id=place_id, name=g.get("displayName", {}).get("text", ""), rating=g.get("rating"),
            user_rating_count=g.get("userRatingCount"), website_uri=g.get("websiteUri"), google_maps_uri=g.get("googleMapsUri"),
            weekday_descriptions=(g.get("regularOpeningHours") or {}).get("weekdayDescriptions"),
            hours=normalize.hours_for(g), source="google",
        )

    async def photo_url(self, place_id: str, max_width: int) -> str | None:
        g = await self._cached(cache_key("photos", place_id), lambda: self._g.details(place_id, ["photos"]))
        photos = g.get("photos") or []
        if not photos:
            return None
        # photoUri is short-lived; keep it well under its expiry.
        return await self._cached(cache_key("photo-uri", photos[0]["name"], max_width), lambda: self._g.photo_uri(photos[0]["name"], max_width), ttl_s=600)
