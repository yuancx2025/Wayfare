from app.contracts.travel import Destination
from app.core.routing import ApiRouter
from app.features.discovery.dependencies import DestinationServiceDep
from app.features.discovery.schemas import ResolveRequest
from app.features.profiles.dependencies import UserIdDep

router = ApiRouter(prefix="/destinations", tags=["destinations"])


@router.get("", response_model=list[Destination])
async def list_destinations(destinations: DestinationServiceDep, _: UserIdDep, q: str = "") -> list[Destination]:
    return await destinations.search(q)


@router.post("/resolve", response_model=Destination)
async def resolve(body: ResolveRequest, destinations: DestinationServiceDep, _: UserIdDep) -> Destination:
    return await destinations.resolve(body.place_id)


@router.get("/{destination_id}", response_model=Destination)
async def get_one(destination_id: str, destinations: DestinationServiceDep, _: UserIdDep) -> Destination:
    return await destinations.get(destination_id)
