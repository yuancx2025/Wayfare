import asyncio
import json
import logging
from typing import Annotated

from fastapi import Header
from sse_starlette import EventSourceResponse

from app.core.exceptions import PlanningError, UpstreamError
from app.core.routing import ApiRouter
from app.features.planning.dependencies import PlanningServiceDep
from app.features.planning.pipeline import STEP_LABELS
from app.features.planning.schemas import TripDraft
from app.features.profiles.dependencies import UserIdDep

log = logging.getLogger(__name__)
router = ApiRouter(prefix="/trips", tags=["trips"])


def _sse(event: str, data: dict) -> dict:
    return {"event": event, "data": json.dumps(data)}


@router.post("/generate", response_class=EventSourceResponse)
async def generate(
    draft: TripDraft, planning: PlanningServiceDep, user_id: UserIdDep,
    idempotency_key: Annotated[str | None, Header(max_length=120)] = None,
):
    """Streams `step` events while the LangGraph planner runs, then `done` (with the saved trip) or `error`."""
    prepared = await planning.prepare(draft, user_id, idempotency_key)

    if prepared.existing:
        trip = prepared.existing

        async def replay():
            yield _sse("done", {"trip": trip.dump()})

        return EventSourceResponse(replay())

    async def events():
        queue: asyncio.Queue[tuple[str, dict]] = asyncio.Queue()

        async def on_step(i: int) -> None:
            await queue.put(("step", {"index": i, "label": STEP_LABELS[i]}))

        async def work() -> None:
            try:
                saved = await planning.generate(prepared, on_step)
                await queue.put(("done", {"trip": saved.dump()}))
            except PlanningError as e:
                await queue.put(("error", {"message": str(e), "retryable": e.retryable}))
            except TimeoutError:
                await queue.put(("error", {"message": "The planner took too long.", "retryable": True}))
            except UpstreamError as e:
                log.warning("Google error during generation: %s", e)
                await queue.put(("error", {"message": "We couldn't reach Google Maps while checking places.", "retryable": True}))
            except Exception:  # noqa: BLE001
                log.exception("Generation failed")
                await queue.put(("error", {"message": "Something went wrong while planning.", "retryable": True}))

        task = asyncio.create_task(work())
        try:
            yield _sse("step", {"index": 0, "label": STEP_LABELS[0]})
            while True:
                event, data = await queue.get()
                yield _sse(event, data)
                if event != "step":
                    break
        finally:
            if not task.done():
                task.cancel()

    return EventSourceResponse(events())
