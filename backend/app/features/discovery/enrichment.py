"""LLM-written blurbs for destinations discovered through Google (Explore cards)."""

import logging

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.contracts.travel import Destination, Interest

log = logging.getLogger(__name__)


class DestinationBlurb(BaseModel):
    blurb: str = Field(description="One evocative sentence, max 90 characters")
    best_for: list[Interest] = Field(description="The 2-3 interests this city is best for")


async def describe_destination(llm: BaseChatModel | None, dest: Destination) -> tuple[str, list[Interest]] | None:
    if llm is None:
        return None
    try:
        out = await llm.with_structured_output(DestinationBlurb).ainvoke([
            SystemMessage("You write short travel-app destination cards."),
            HumanMessage(f"City: {dest.name}, {dest.country}"),
        ])
    except Exception as e:  # noqa: BLE001
        log.warning("describe_destination failed: %s", e)
        return None
    return out.blurb.strip(), list(dict.fromkeys(out.best_for))[:3]  # type: ignore[union-attr]


async def enrich(dest: Destination, llm: BaseChatModel | None) -> Destination:
    if dest.blurb and dest.best_for:
        return dest
    described = await describe_destination(llm, dest)
    if described:
        blurb, best_for = described
        return dest.model_copy(update={"blurb": dest.blurb or blurb, "best_for": dest.best_for or best_for})
    return dest
