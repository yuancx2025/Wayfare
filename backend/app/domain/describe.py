"""Plain-language descriptions of preferences and places, shared by LLM prompts across features."""

from app.contracts.travel import Place, Preferences
from app.domain.scheduler import FOOD_LABEL, INTEREST_LABEL, PACE_LABEL, TRANSPORT_LABEL


def prefs_sentence(p: Preferences) -> str:
    ints = ", ".join(INTEREST_LABEL[i] for i in p.interests).lower() or "a bit of everything"
    foods = ", ".join(FOOD_LABEL[f] for f in p.food).lower() or "no particular food style"
    return (
        f"A {PACE_LABEL[p.pace].lower()} pace focused on {ints}; food: {foods}; "
        f"getting around by {TRANSPORT_LABEL[p.transport].lower()} on a {p.budget} budget."
    )


def price_tag(p: Place) -> str:
    return "$" * p.price if p.price else "-"
