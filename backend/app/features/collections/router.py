from app.core.routing import ApiRouter
from app.features.collections.dependencies import CollectionServiceDep
from app.features.collections.schemas import SavedPlace, SavedPlaceReference
from app.features.profiles.dependencies import UserIdDep

router = ApiRouter(prefix="/me/saved-places", tags=["collections"])


@router.get("", response_model=list[SavedPlace])
async def list_saved_places(collections: CollectionServiceDep, user_id: UserIdDep) -> list[SavedPlace]:
    return await collections.list_saved_places(user_id)


@router.post("", response_model=SavedPlace)
async def save_place(reference: SavedPlaceReference, collections: CollectionServiceDep, user_id: UserIdDep) -> SavedPlace:
    return await collections.save_place(user_id, reference)


@router.delete("/{saved_id}", status_code=204)
async def remove_saved_place(saved_id: str, collections: CollectionServiceDep, user_id: UserIdDep) -> None:
    await collections.remove_saved_place(user_id, saved_id)
