"""Free-text Adjust Day agent (create_react_agent) driven by a scripted tool-calling fake model."""

from langchain_core.messages import AIMessage

from app.integrations.places.catalog_data import catalog_places
from tests.conftest import fake_llm


def call(name: str, args: dict, i: int) -> AIMessage:
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": f"call-{i}", "type": "tool_call"}])


async def test_agent_edits_working_copy_and_returns_a_preview(make_client):
    probe = await make_client()
    [seed] = (await probe.get("/trips")).json()
    trip = (await probe.get(f"/trips/{seed['id']}")).json()
    day = trip["days"][1]
    target = next(a for a in day["activities"] if a["category"] != "food")
    used = {a["placeId"] for d in trip["days"] for a in d["activities"]}
    museum = next(p for p in catalog_places("nyc") if p.category != "food" and p.id not in used)

    script = iter([
        call("view_day", {}, 1),
        call("search_places", {"category": museum.category, "near_activity_id": target["id"]}, 2),
        call("swap_activity", {"activity_id": target["id"], "place_id": museum.id}, 3),
        call("set_day_timing", {"start_time": "10:00"}, 4),
        AIMessage(content=f"Swapped {target['name']} for {museum.name} and started later."),
    ])
    client = await make_client(llm=fake_llm(messages=script, tools=True))
    assert (await client.get("/health")).json()["agent"] is True

    resp = await client.post(f"/trips/{seed['id']}/days/1/proposals", json={"kind": "custom", "instruction": "It's going to rain, more indoor stuff"})
    assert resp.status_code == 200, resp.text
    prop = resp.json()
    assert prop["proposalId"]
    assert {"type": "removed", "text": target["name"]} in prop["changes"]
    assert any(c["type"] == "added" and c["text"].startswith(museum.name) for c in prop["changes"])
    assert prop["day"]["startMin"] == 600 and prop["day"]["activities"][0]["startMin"] == 600
    assert prop["newId"].endswith(museum.id)
    assert (await client.get(f"/trips/{seed['id']}")).json()["days"][1] == day, "agent never writes directly"

    applied = (await client.post(f"/trips/{seed['id']}/proposals/{prop['proposalId']}/apply")).json()
    assert any(a["placeId"] == museum.id for a in applied["days"][1]["activities"])


async def test_agent_rejects_invented_place_ids(make_client):
    probe = await make_client()
    [seed] = (await probe.get("/trips")).json()
    trip = (await probe.get(f"/trips/{seed['id']}")).json()
    target = trip["days"][0]["activities"][0]
    script = iter([
        call("swap_activity", {"activity_id": target["id"], "place_id": "made-up-place"}, 1),
        AIMessage(content="I couldn't find that place."),
    ])
    client = await make_client(llm=fake_llm(messages=script, tools=True))
    prop = (await client.post(f"/trips/{seed['id']}/days/0/proposals", json={"kind": "custom", "instruction": "swap the first stop"})).json()
    assert prop["changes"] == [] and "proposalId" not in prop
