"""Pydantic schemas must serialize to the shapes declared in the app's `src/domain/types.ts`."""

import re
import types
import typing
from pathlib import Path

import pytest

from app.contracts import travel
from app.features.planning import schemas as planning_schemas
from app.features.profiles import schemas as profile_schemas
from app.features.trips import schemas as trip_schemas
from app.features.collections import schemas as collection_schemas

TYPES_TS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "domain" / "types.ts"
# Client-only fields that intentionally have no server counterpart.
CLIENT_ONLY = {"Destination": {"places"}, "TripDraft": {"simulateFailure"}}
MODELS = ["Preferences", "Place", "Destination", "Leg", "Activity", "Day", "Trip", "TripSummary", "TripMetadataResult", "TripDraft", "Me", "ProfilePatch", "SavedPlaceReference", "SavedPlace", "SavedPlaceDetails"]


def ts_interfaces() -> dict[str, dict[str, bool]]:
    """interface name -> {field: optional}"""
    src = TYPES_TS.read_text()
    out, parents = {}, {}
    for name, bases, body in re.findall(r"export interface (\w+)(?: extends ([\w, ]+))? \{(.*?)\n\}", src, re.S):
        fields = {}
        for m in re.finditer(r"^\s*(\w+)(\??):", body, re.M):
            fields[m.group(1)] = m.group(2) == "?"
        out[name] = fields
        parents[name] = bases.split(",") if bases else []
    for name, bases in parents.items():
        for base in bases:
            out[name] = {**out[base.strip()], **out[name]}
    return out


def allows_none(annotation) -> bool:
    return isinstance(annotation, types.UnionType | typing._UnionGenericAlias) and type(None) in typing.get_args(annotation)  # type: ignore[attr-defined]


@pytest.mark.parametrize("name", MODELS)
def test_model_matches_typescript_interface(name):
    ts = ts_interfaces()[name]
    model = next((getattr(module, name) for module in (travel, planning_schemas, profile_schemas, trip_schemas, collection_schemas) if hasattr(module, name)), None)
    assert model is not None, f"{name} is missing from the Pydantic models"
    by_alias = {f.alias or k: f for k, f in model.model_fields.items()}
    for field, optional in ts.items():
        if field in CLIENT_ONLY.get(name, set()):
            continue
        assert field in by_alias, f"{name}.{field} is missing from the Pydantic model"
        f = by_alias[field]
        if optional:
            assert not f.is_required(), f"{name}.{field} is optional in TS but required in Python"
        else:
            assert not allows_none(f.annotation), f"{name}.{field} is required in TS but nullable in Python"
    for alias, f in by_alias.items():
        if alias not in ts:
            assert not f.is_required(), f"{name}.{alias} is server-only, so it must be optional"
