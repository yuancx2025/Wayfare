from app.contracts.travel import Place, Trip
from app.core.routing import ApiRouter
from app.features.adjustments.dependencies import AdjustmentServiceDep
from app.features.adjustments.schemas import Proposal, ProposalRequest
from app.features.profiles.dependencies import UserIdDep
from app.features.trips.dependencies import TripDep

router = ApiRouter(prefix="/trips/{trip_id}", tags=["adjust"])


@router.get("/days/{day_index}/activities/{activity_id}/alternatives", response_model=list[Place])
async def alternatives(day_index: int, activity_id: str, trip: TripDep, adjustments: AdjustmentServiceDep) -> list[Place]:
    return await adjustments.alternatives(trip, day_index, activity_id)


@router.post("/days/{day_index}/proposals", response_model=Proposal)
async def propose(day_index: int, body: ProposalRequest, trip: TripDep, adjustments: AdjustmentServiceDep) -> Proposal:
    """Computes a preview of the adjusted day. Nothing changes until the proposal is applied."""
    return await adjustments.preview(trip, day_index, body)


@router.post("/proposals/{proposal_id}/apply", response_model=Trip)
async def apply(proposal_id: str, trip: TripDep, adjustments: AdjustmentServiceDep, user_id: UserIdDep) -> Trip:
    return await adjustments.apply(user_id, trip, proposal_id)
