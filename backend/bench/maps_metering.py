"""Count Google Maps requests by billing SKU and price them at list rates.

The SKU comes from the endpoint plus the field mask: the most expensive field in the mask sets the tier. Prices and
field tiers were copied from Google's pages on PRICES_CHECKED and should be re-checked before quoting them.
"""

import json
from dataclasses import dataclass, field
from time import perf_counter
from typing import Any

import httpx

from app.integrations.places.google_client import DESTINATION_FIELDS, DETAIL_FIELDS

PRICES_CHECKED = "2026-11-11"
PRICE_LIST = "https://developers.google.com/maps/billing-and-pricing/pricing"
FIELD_TIERS_SOURCE = "https://developers.google.com/maps/documentation/places/web-service/data-fields"
ROUTES_BILLING = "https://developers.google.com/maps/documentation/routes/usage-and-billing"

# SKU: (USD per 1,000 events in the first paid band, free events per month).
SKUS: dict[str, tuple[float, int | None]] = {
    "Text Search Essentials (IDs Only)": (0.0, None),
    "Text Search Pro": (32.0, 5_000),
    "Text Search Enterprise": (35.0, 1_000),
    "Text Search Enterprise + Atmosphere": (40.0, 1_000),
    "Nearby Search Pro": (32.0, 5_000),
    "Nearby Search Enterprise": (35.0, 1_000),
    "Nearby Search Enterprise + Atmosphere": (40.0, 1_000),
    "Place Details Essentials (IDs Only)": (0.0, None),
    "Place Details Essentials": (5.0, 10_000),
    "Place Details Pro": (17.0, 5_000),
    "Place Details Enterprise": (20.0, 1_000),
    "Place Details Enterprise + Atmosphere": (25.0, 1_000),
    "Place Details Photos": (7.0, 1_000),
    "Autocomplete Requests": (2.83, 10_000),
    "Compute Routes Essentials": (5.0, 10_000),
    "Compute Routes Pro": (10.0, 5_000),
}

TIERS = ("Essentials (IDs Only)", "Essentials", "Pro", "Enterprise", "Enterprise + Atmosphere")
E0, E1, PRO, ENT, ATM = TIERS
# Field: (Place Details tier, Text Search tier, Nearby Search tier), for every field the app requests.
FIELD_TIERS: dict[str, tuple[str, str, str]] = {
    "id": (E0, E0, PRO), "photos": (E0, PRO, PRO),
    "types": (E1, PRO, PRO), "location": (E1, PRO, PRO), "viewport": (E1, PRO, PRO), "addressComponents": (E1, PRO, PRO),
    "shortFormattedAddress": (E1, PRO, PRO), "formattedAddress": (E1, PRO, PRO),
    "displayName": (PRO, PRO, PRO), "primaryType": (PRO, PRO, PRO), "businessStatus": (PRO, PRO, PRO),
    "googleMapsUri": (PRO, PRO, PRO), "utcOffsetMinutes": (PRO, PRO, PRO),
    "priceLevel": (ENT, ENT, ENT), "rating": (ENT, ENT, ENT), "userRatingCount": (ENT, ENT, ENT),
    "regularOpeningHours": (ENT, ENT, ENT), "currentOpeningHours": (ENT, ENT, ENT), "websiteUri": (ENT, ENT, ENT),
    "editorialSummary": (ATM, ATM, ATM),
}
UNCACHED_KINDS = ("autocomplete", "around")


class RequestCapReached(RuntimeError):
    pass


@dataclass
class Call:
    kind: str  # The place_cache key prefix this request fills, or an uncached kind.
    sku: str
    status: int | None = None
    ms: float | None = None
    context: dict[str, Any] = field(default_factory=dict)

    @property
    def usd(self) -> float:
        return SKUS[self.sku][0] / 1000


def _tier(mask: str, column: int, prefix: str = "") -> str:
    fields = [f.removeprefix(prefix).split(".")[0] for f in mask.split(",") if f]
    unknown = [f for f in fields if f not in FIELD_TIERS]
    if unknown or not fields:
        raise ValueError(f"No billing tier recorded for field mask {mask!r}")
    return max((FIELD_TIERS[f][column] for f in fields), key=TIERS.index)


def classify(request: httpx.Request) -> Call:
    path, mask = request.url.path, request.headers.get("X-Goog-FieldMask", "")
    body = json.loads(request.content) if request.content else {}
    if path.endswith("/directions/v2:computeRoutes"):
        pro = body.get("routingPreference", "").startswith("TRAFFIC_AWARE") or len(body.get("intermediates", [])) > 10
        return Call("leg", f"Compute Routes {'Pro' if pro else 'Essentials'}")
    if path == "/v1/places:autocomplete":
        return Call("autocomplete", "Autocomplete Requests")
    if path == "/v1/places:searchText":
        return Call("cities" if body.get("includedType") == "locality" else "ts", f"Text Search {_tier(mask, 1, 'places.')}")
    if path == "/v1/places:searchNearby":
        return Call("around" if body.get("rankPreference") == "DISTANCE" else "nearby", f"Nearby Search {_tier(mask, 2, 'places.')}")
    if path.endswith("/media"):
        return Call("photo-uri", "Place Details Photos")
    if path.startswith("/v1/places/"):
        fields = mask.split(",")
        kind = "dest" if fields == DESTINATION_FIELDS else "photos" if fields == ["photos"] else "details"
        if kind == "details" and fields != DETAIL_FIELDS:
            raise ValueError(f"Unrecognized Place Details field mask {mask!r}")
        return Call(kind, f"Place Details {_tier(mask, 0)}")
    raise ValueError(f"Unrecognized Google request {request.method} {path}")


class CountingTransport(httpx.AsyncBaseTransport):
    """Wraps the fake or a real transport. Records every request; refuses to send past `max_requests`."""

    def __init__(self, inner: httpx.AsyncBaseTransport, max_requests: int | None = None):
        self.inner, self.max_requests = inner, max_requests
        self.calls: list[Call] = []
        self.context: dict[str, Any] = {}
        self.capped = False

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        call = classify(request)
        if self.max_requests is not None and len(self.calls) >= self.max_requests:
            self.capped = True
            raise RequestCapReached(f"Stopped before Google request {len(self.calls) + 1}: cap is {self.max_requests}")
        call.context = dict(self.context)
        self.calls.append(call)
        start = perf_counter()
        response = await self.inner.handle_async_request(request)
        call.status, call.ms = response.status_code, (perf_counter() - start) * 1000
        return response

    async def aclose(self) -> None:
        await self.inner.aclose()
