from fastapi import APIRouter


class ApiRouter(APIRouter):
    """Omits null fields so responses match the optional (`?:`) fields in `frontend/src/domain/types.ts`."""

    def add_api_route(self, *args, **kwargs):
        kwargs["response_model_exclude_none"] = True
        super().add_api_route(*args, **kwargs)
