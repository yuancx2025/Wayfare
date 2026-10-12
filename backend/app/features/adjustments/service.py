from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.travel import Day, Place, Trip
from app.core.exceptions import AppError, BadGateway, Conflict, Gone, NotFound, PlanningError, UpstreamError
from app.db.base import utcnow
from app.features.adjustments import proposals, repository
from app.features.adjustments.agent import propose_custom
from app.features.adjustments.schemas import Proposal, ProposalRequest
from app.features.discovery.service import DestinationService
from app.features.trips.service import TripService
from app.integrations.services import Services


def _alt_key(trip_id: str, day_index: int, activity_id: str) -> str:
    return f"alt:{trip_id}:{day_index}:{activity_id}"[:512]


def _day_or_404(trip: Trip, day_index: int) -> None:
    if not 0 <= day_index < len(trip.days):
        raise NotFound("Day not found")


def _activity_or_404(trip: Trip, day_index: int, activity_id: str | None) -> None:
    if not any(a.id == activity_id for a in trip.days[day_index].activities):
        raise NotFound("Activity not found")


class AdjustmentService:
    """Previews are computed and stored as proposals; the trip only changes when a proposal is applied."""

    def __init__(self, session: AsyncSession, trips: TripService, destinations: DestinationService, services: Services):
        self.session = session
        self.trips = trips
        self.destinations = destinations
        self.services = services

    async def alternatives(self, trip: Trip, day_index: int, activity_id: str) -> list[Place]:
        _day_or_404(trip, day_index)
        _activity_or_404(trip, day_index, activity_id)
        try:
            dest = await self.destinations.get_for_trip(trip.destination_id)
            places = await proposals.replacement_candidates(trip, day_index, activity_id, dest, self.services)
        except UpstreamError as e:
            raise BadGateway("Couldn't search for alternatives right now") from e
        await self.services.cache.set(_alt_key(trip.id, day_index, activity_id), [p.dump() for p in places])
        return places

    async def _replacement_place(self, trip: Trip, day_index: int, body: ProposalRequest) -> Place:
        cached = await self.services.cache.get(_alt_key(trip.id, day_index, body.activity_id or ""))
        for p in cached or []:
            if p.get("id") == body.place_id:
                return Place.model_validate(p)
        place = await self.services.places.get_place(body.place_id or "")
        if place is None:
            raise NotFound("Replacement place not found")
        return place

    async def preview(self, trip: Trip, day_index: int, body: ProposalRequest) -> Proposal:
        _day_or_404(trip, day_index)
        try:
            if body.kind == "relaxed":
                proposal = await proposals.propose_relaxed(trip, day_index, self.services)
            elif body.kind == "less-walking":
                proposal = await proposals.propose_less_walking(trip, day_index, self.services)
            elif body.kind == "more-food":
                dest = await self.destinations.get_for_trip(trip.destination_id)
                proposal = await proposals.propose_more_food(trip, day_index, dest, self.services)
            elif body.kind == "replace":
                _activity_or_404(trip, day_index, body.activity_id)
                place = await self._replacement_place(trip, day_index, body)
                if place.id in proposals.used_place_ids(trip):
                    raise Conflict("That place is already in this trip")
                proposal = await proposals.propose_replacement(trip, day_index, body.activity_id or "", place, self.services)
            else:
                dest = await self.destinations.get_for_trip(trip.destination_id)
                proposal = await propose_custom(trip, day_index, dest, body.instruction or "", self.services)
        except UpstreamError as e:
            raise BadGateway("Google Maps is unavailable right now") from e
        except PlanningError as e:
            raise AppError(str(e), 503 if e.retryable else 400) from e

        if proposal.changes:
            proposal.proposal_id = await repository.create_proposal(self.session, trip, body.kind, proposal)
        return proposal

    async def apply(self, user_id: str, trip: Trip, proposal_id: str) -> Trip:
        prop = await repository.get_proposal(self.session, trip.id, proposal_id)
        if prop is None:
            raise NotFound("Proposal not found")
        if prop.expires_at < utcnow():
            raise Gone("This preview expired. Open Adjust Day again.")
        if prop.base_version != trip.version:
            raise Conflict("This day changed since the preview. Open Adjust Day again.")
        updated = await self.trips.replace_day(user_id, trip.id, Day.model_validate(prop.day))
        await repository.delete_proposal(self.session, prop)
        return updated
