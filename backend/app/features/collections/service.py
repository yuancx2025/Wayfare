from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound
from app.features.collections import repository
from app.features.collections.schemas import SavedPlace, SavedPlaceReference


class CollectionService:
    """Persistence does not fetch provider details, so unavailable references stay removable."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_saved_places(self, user_id: str) -> list[SavedPlace]:
        return [repository.saved_place_from_row(row) for row in await repository.list_saved_places(self.session, user_id)]

    async def save_place(self, user_id: str, reference: SavedPlaceReference) -> SavedPlace:
        row = await repository.save_place(self.session, user_id, reference)
        result = repository.saved_place_from_row(row)
        await self.session.commit()
        return result

    async def remove_saved_place(self, user_id: str, saved_id: str) -> None:
        if not await repository.remove_saved_place(self.session, user_id, saved_id):
            raise NotFound("Saved place not found")
        await self.session.commit()
