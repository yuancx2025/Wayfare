"""Short LLM-written "why this fits you" lines for places added by adjustments."""

import logging

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.contracts.travel import Place, Preferences
from app.domain.describe import prefs_sentence, price_tag

log = logging.getLogger(__name__)


class WhyItem(BaseModel):
    id: str
    why: str = Field(description="One sentence (max 18 words), second person")


class WhyLines(BaseModel):
    items: list[WhyItem]


async def write_whys(llm: BaseChatModel | None, prefs: Preferences, places: list[Place], context: str) -> dict[str, str]:
    """LLM-written 'why this fits you' lines keyed by place id. Empty dict when no model (callers fall back)."""
    if llm is None or not places:
        return {}
    listing = "\n".join(f"{p.id} | {p.name} | {p.category} | {p.area} | {price_tag(p)} | {p.description[:90]}" for p in places)
    try:
        out = await llm.with_structured_output(WhyLines).ainvoke([
            SystemMessage("Write one short 'why this fits you' line per place for a traveler. Second person, specific, no fluff."),
            HumanMessage(f"Traveler: {prefs_sentence(prefs)}\nContext: {context}\nPlaces (id | name | category | area | price | about):\n{listing}"),
        ])
    except Exception as e:  # noqa: BLE001 - explanations are optional, never fail the request
        log.warning("write_whys failed: %s", e)
        return {}
    known = {p.id for p in places}
    return {i.id: i.why.strip() for i in out.items if i.id in known and i.why.strip()}  # type: ignore[union-attr]
