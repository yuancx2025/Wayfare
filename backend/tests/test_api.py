"""HTTP-level tests over the offline catalog providers."""

import asyncio
import json

from tests.conftest import FixedRouter

DRAFT = {
    "destination": "Chicago, Illinois", "destinationId": "chicago", "startDate": "2030-06-10", "endDate": "2030-06-12", "travelers": 1,
    "prefs": {"pace": "packed", "interests": ["architecture", "nightlife", "food"], "food": ["fine-dining", "cafes"], "transport": "walking", "budget": "premium"},
}


def parse_sse(text: str) -> list[tuple[str, dict]]:
    events = []
    for block in text.replace("\r\n", "\n").split("\n\n"):
        fields = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        if "event" in fields:
            events.append((fields["event"], json.loads(fields["data"])))
    return events


async def generate(client, draft=DRAFT, key=None):
    headers = {"Idempotency-Key": key} if key else {}
    resp = await client.post("/trips/generate", json=draft, headers=headers)
    return resp, parse_sse(resp.text)


async def test_health_profile_and_preferences(make_client):
    client = await make_client()
    assert (await client.get("/health")).json() == {"status": "ok", "google": False, "llm": False, "agent": False}
    me = (await client.get("/me")).json()
    assert me["name"] == "Traveler" and me["initials"] == "T" and me["stats"] == {"trips": 1, "daysPlanned": 5, "countries": 1}
    demo = (await client.get("/me", headers={"X-User-Id": "demo-user"})).json()
    assert demo["name"] == "Alex Rivera" and demo["initials"] == "AR"

    prefs = (await client.get("/me/preferences")).json()
    assert prefs["pace"] == "balanced"
    prefs["pace"] = "relaxed"
    assert (await client.put("/me/preferences", json=prefs)).json()["pace"] == "relaxed"
    assert (await client.get("/me/preferences")).json()["pace"] == "relaxed"
    assert (await client.get("/me", headers={"X-User-Id": "bad id!"})).status_code == 400


async def test_new_user_first_requests_can_race(make_client):
    client = await make_client()
    headers = {"X-User-Id": "fresh-install-1"}
    responses = await asyncio.gather(*[client.get(path, headers=headers) for path in ("/trips", "/me/preferences", "/me", "/trips")])
    assert [r.status_code for r in responses] == [200] * 4
    assert len((await client.get("/trips", headers=headers)).json()) == 1


async def test_trips_are_scoped_to_user_and_deletable(make_client):
    client = await make_client()
    [seed] = (await client.get("/trips")).json()
    assert seed["destinationId"] == "nyc" and seed["dayCount"] == 5 and seed["stopCount"] > 0
    trip = (await client.get(f"/trips/{seed['id']}")).json()
    assert set(trip) >= {"id", "days", "prefs", "adjusted", "createdAt", "version"}
    assert "walkCapMin" not in trip["days"][0], "null fields are omitted like optional TS fields"
    assert "legIn" not in trip["days"][0]["activities"][0]

    assert (await client.get(f"/trips/{seed['id']}", headers={"X-User-Id": "someone-else"})).status_code == 404
    assert (await client.delete(f"/trips/{seed['id']}")).status_code == 204
    assert (await client.get("/trips")).json() == []


async def test_generate_streams_steps_then_saves_trip(make_client):
    client = await make_client()
    resp, events = await generate(client, key="idem-1")
    assert resp.status_code == 200 and resp.headers["content-type"].startswith("text/event-stream")
    assert [e for e, _ in events] == ["step"] * 5 + ["done"]
    assert [d["index"] for e, d in events if e == "step"] == [0, 1, 2, 3, 4]
    trip = events[-1][1]["trip"]
    assert trip["destination"] == "Chicago" and len(trip["days"]) == 3
    assert any(t["id"] == trip["id"] for t in (await client.get("/trips")).json())

    _, replay = await generate(client, key="idem-1")
    assert [e for e, _ in replay] == ["done"] and replay[0][1]["trip"]["id"] == trip["id"]
    assert len((await client.get("/trips")).json()) == 2  # seed + one generated


async def test_generate_rejects_bad_drafts(make_client):
    client = await make_client()
    resp, _ = await generate(client, {**DRAFT, "destination": "Atlantis", "destinationId": None})
    assert resp.status_code == 422 and "Without a Google Maps key" in resp.json()["detail"]
    resp, _ = await generate(client, {**DRAFT, "endDate": "2030-06-01"})
    assert resp.status_code == 422
    resp, _ = await generate(client, {**DRAFT, "prefs": {**DRAFT["prefs"], "interests": []}})
    assert resp.status_code == 422


async def test_generate_resolves_destination_by_name(make_client):
    client = await make_client()
    _, events = await generate(client, {**DRAFT, "destination": "seattle", "destinationId": None})
    assert events[-1][0] == "done" and events[-1][1]["trip"]["destinationId"] == "seattle"


async def test_places_and_destinations(make_client):
    client = await make_client()
    assert [s["placeId"] for s in (await client.get("/places/autocomplete", params={"q": "sea"})).json()] == ["seattle"]
    details = (await client.get("/places/ny-met", params={"date": "2030-06-11", "startMin": 600, "durationMin": 90})).json()
    assert details["name"] == "The Met" and details["source"] == "catalog" and "openDuringVisit" not in details
    assert (await client.get("/places/nope")).status_code == 404
    photo = await client.get("/places/nyc/photo", follow_redirects=False)
    assert photo.status_code == 302 and photo.headers["location"].startswith("https://images.unsplash.com/")

    all_dest = (await client.get("/destinations")).json()
    assert len(all_dest) == 6 and all_dest[0]["id"] == "nyc"
    assert [d["id"] for d in (await client.get("/destinations", params={"q": "nightlife"})).json()] == ["new-orleans"]
    assert (await client.get("/destinations", params={"q": "zzz"})).json() == []
    assert (await client.post("/destinations/resolve", json={"placeId": "seattle"})).json()["name"] == "Seattle"
    assert (await client.post("/destinations/resolve", json={"placeId": "nowhere"})).status_code == 404


async def test_day_route_polylines(make_client):
    client = await make_client(router=FixedRouter())
    [seed] = (await client.get("/trips")).json()
    route = (await client.get(f"/trips/{seed['id']}/days/0/route")).json()
    assert route["source"] == "google" and route["legs"] and all(leg["polyline"] == "encoded~poly" for leg in route["legs"])
    assert (await client.get(f"/trips/{seed['id']}/days/9/route")).status_code == 404


async def test_adjust_preview_then_apply(make_client):
    client = await make_client()
    [seed] = (await client.get("/trips")).json()
    tid = seed["id"]
    before = (await client.get(f"/trips/{tid}")).json()

    prop = (await client.post(f"/trips/{tid}/days/0/proposals", json={"kind": "relaxed"})).json()
    assert prop["proposalId"] and prop["changes"][0]["type"] == "removed"
    assert (await client.get(f"/trips/{tid}")).json() == before, "previews never change the trip"

    applied = (await client.post(f"/trips/{tid}/proposals/{prop['proposalId']}/apply")).json()
    assert applied["adjusted"] is True and applied["version"] == 2 and applied["days"][0] == prop["day"]
    assert (await client.post(f"/trips/{tid}/proposals/{prop['proposalId']}/apply")).status_code == 404

    stale = (await client.post(f"/trips/{tid}/days/1/proposals", json={"kind": "more-food"})).json()
    fresh = (await client.post(f"/trips/{tid}/days/2/proposals", json={"kind": "relaxed"})).json()
    assert (await client.post(f"/trips/{tid}/proposals/{fresh['proposalId']}/apply")).status_code == 200
    assert (await client.post(f"/trips/{tid}/proposals/{stale['proposalId']}/apply")).status_code == 409


async def test_replace_flow_uses_alternatives(make_client):
    client = await make_client()
    [seed] = (await client.get("/trips")).json()
    trip = (await client.get(f"/trips/{seed['id']}")).json()
    target = trip["days"][0]["activities"][0]
    alts = (await client.get(f"/trips/{seed['id']}/days/0/activities/{target['id']}/alternatives")).json()
    assert 1 <= len(alts) <= 3
    used = {a["placeId"] for d in trip["days"] for a in d["activities"]}
    assert not {a["id"] for a in alts} & used

    prop = (await client.post(f"/trips/{seed['id']}/days/0/proposals", json={"kind": "replace", "activityId": target["id"], "placeId": alts[0]["id"]})).json()
    assert prop["replacedId"] == target["id"] and prop["newId"].endswith(alts[0]["id"])
    assert [c["type"] for c in prop["changes"]] == ["removed", "added"]

    dup = await client.post(f"/trips/{seed['id']}/days/0/proposals", json={"kind": "replace", "activityId": target["id"], "placeId": target["placeId"]})
    assert dup.status_code == 409
    assert (await client.post(f"/trips/{seed['id']}/days/0/proposals", json={"kind": "replace"})).status_code == 422
    custom = await client.post(f"/trips/{seed['id']}/days/0/proposals", json={"kind": "custom", "instruction": "rainy day please"})
    assert custom.status_code == 400 and "LLM" in custom.json()["detail"]


async def test_patch_profile_applies_partial_trimmed_updates(make_client):
    client = await make_client()
    before = (await client.get("/me")).json()
    assert (await client.patch("/me", json={})).json() == before

    home_only = (await client.patch("/me", json={"home": "  Queens, NY  "})).json()
    assert home_only["name"] == "Traveler" and home_only["home"] == "Queens, NY" and home_only["initials"] == "T"
    assert home_only["stats"] == before["stats"]

    renamed = (await client.patch("/me", json={"name": "  Ada Lovelace  "})).json()
    assert renamed["name"] == "Ada Lovelace" and renamed["home"] == "Queens, NY" and renamed["initials"] == "AL"

    assert (await client.patch("/me", json={"home": "   "})).json()["home"] == ""
    cleared = (await client.patch("/me", json={"home": ""})).json()
    assert cleared["name"] == "Ada Lovelace" and cleared["home"] == ""
    assert (await client.get("/me/preferences")).json()["pace"] == "balanced"


async def test_patch_profile_rejects_invalid_payloads(make_client):
    client = await make_client()
    before = (await client.get("/me")).json()
    long = "x" * 121
    payloads = [
        {"name": ""},
        {"name": "   "},
        {"name": long},
        {"home": long},
        {"name": None},
        {"home": None},
        {"name": 12},
        {"id": "x"},
        {"stats": {"trips": 1, "daysPlanned": 0, "countries": 0}},
        {"travelingSince": 2020},
    ]
    for payload in payloads:
        response = await client.patch("/me", json=payload)
        assert response.status_code == 422, payload
    assert (await client.get("/me")).json() == before


async def test_patch_profile_persists_and_stays_scoped_to_the_user(make_client):
    client = await make_client()
    assert (await client.patch("/me", json={"name": "Kept", "home": "Boston"})).status_code == 200

    again = await make_client()
    me = (await again.get("/me")).json()
    assert me["name"] == "Kept" and me["home"] == "Boston" and me["initials"] == "K"

    demo = (await again.get("/me", headers={"X-User-Id": "demo-user"})).json()
    assert demo["name"] == "Alex Rivera" and demo["home"] == "Brooklyn, NY"
    other = (await again.get("/me", headers={"X-User-Id": "other-user"})).json()
    assert other["name"] == "Traveler" and other["home"] == ""


async def test_expired_postgres_proposal_is_rejected_without_mutating_trip(make_client):
    from datetime import timedelta
    from app.db.base import utcnow
    from app.db.session import get_sessionmaker
    from app.features.adjustments.models import ProposalRow

    client = await make_client()
    [seed] = (await client.get("/trips")).json()
    before = (await client.get(f"/trips/{seed['id']}")).json()
    preview = (await client.post(f"/trips/{seed['id']}/days/0/proposals", json={"kind": "relaxed"})).json()
    async with get_sessionmaker()() as session:
        proposal = await session.get(ProposalRow, preview["proposalId"])
        proposal.expires_at = utcnow() - timedelta(seconds=1)
        await session.commit()
    response = await client.post(f"/trips/{seed['id']}/proposals/{preview['proposalId']}/apply")
    assert response.status_code == 410
    assert (await client.get(f"/trips/{seed['id']}")).json() == before
