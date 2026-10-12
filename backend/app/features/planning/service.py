import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from app.contracts.travel import Destination, Trip
from app.core.config import get_settings
from app.core.exceptions import BadGateway, UpstreamError
from app.core.ids import new_id, slugify
from app.features.discovery.service import DestinationService
from app.features.planning.pipeline import run_planner
from app.features.planning.schemas import TripDraft
from app.features.trips.service import TripService
from app.integrations.services import Services


@dataclass
class PreparedGeneration:
    """A validated generation request: either a replay of an earlier trip or a destination to plan for."""

    draft: TripDraft
    user_id: str
    idempotency_key: str | None
    destination: Destination
    trip_id: str
    existing: Trip | None = None


class PlanningService:
    def __init__(self, trips: TripService, destinations: DestinationService, services: Services):
        self.trips = trips
        self.destinations = destinations
        self.services = services

    async def prepare(self, draft: TripDraft, user_id: str, idempotency_key: str | None) -> PreparedGeneration:
        """Runs before streaming starts, so its errors are plain HTTP errors rather than SSE `error` events."""
        try:
            dest = await self.destinations.resolve_for_draft(draft.destination_id, draft.destination)
        except UpstreamError as e:
            raise BadGateway("Destination lookup is unavailable right now") from e
        existing = await self.trips.find_by_idempotency(user_id, idempotency_key) if idempotency_key else None
        return PreparedGeneration(
            draft=draft, user_id=user_id, idempotency_key=idempotency_key, destination=dest,
            trip_id=new_id(f"trip-{slugify(dest.name)[:24]}"), existing=existing,
        )

    async def generate(self, prepared: PreparedGeneration, on_step: Callable[[int], Awaitable[None]]) -> Trip:
        """Runs the planner and saves the trip. Raises `PlanningError`, `TimeoutError`, or `UpstreamError`."""
        async with asyncio.timeout(get_settings().generation_timeout_s):
            trip = await run_planner(self.services, prepared.trip_id, prepared.destination, prepared.draft, on_step)
        return await self.trips.save_generated(prepared.user_id, trip, prepared.idempotency_key)
