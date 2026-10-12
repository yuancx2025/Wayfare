from dataclasses import dataclass, field
from typing import Annotated

from fastapi import Depends, Request
from langchain_core.language_models import BaseChatModel

from app.integrations.cache import PlaceCache
from app.integrations.llm.client import supports_tools
from app.integrations.places.protocol import PlaceProvider
from app.integrations.routing.protocol import TravelRouter


@dataclass
class Services:
    """External providers for one app instance. Built in `bootstrap/providers.py`; tests inject fakes via `create_app`."""

    places: PlaceProvider
    router: TravelRouter
    llm: BaseChatModel | None
    cache: PlaceCache
    closers: list = field(default_factory=list)

    @property
    def agent_enabled(self) -> bool:
        return supports_tools(self.llm)

    async def aclose(self) -> None:
        for c in self.closers:
            await c()


def get_services(request: Request) -> Services:
    return request.app.state.services


ServicesDep = Annotated[Services, Depends(get_services)]
