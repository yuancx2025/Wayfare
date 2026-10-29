import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.bootstrap.providers import build_services
from app.bootstrap.seed import seed_catalog, seed_new_user
from app.contracts.system import Capabilities
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.routing import ApiRouter
from app.db.session import dispose_engine, get_sessionmaker
from app.features.adjustments.router import router as adjustments_router
from app.features.collections.router import router as collections_router
from app.features.discovery.destinations_router import router as destinations_router
from app.features.discovery.places_router import router as places_router
from app.features.planning.router import router as planning_router
from app.features.profiles.router import router as profiles_router
from app.features.trips.router import router as trips_router
from app.integrations.services import Services

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)


def create_app(services: Services | None = None) -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with get_sessionmaker()() as session:
            await seed_catalog(session)
        app.state.services = services or build_services(settings)
        yield
        await app.state.services.aclose()
        await dispose_engine()

    app = FastAPI(title="Wayfare API", version="0.1.0", lifespan=lifespan)
    app.state.seed_new_user = seed_new_user
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"],
        expose_headers=["Location"],
    )
    app.add_exception_handler(AppError, handle_app_error)  # type: ignore[arg-type]

    health = ApiRouter(tags=["health"])

    @health.get("/health", response_model=Capabilities)
    async def get_health(request: Request) -> Capabilities:
        s: Services = request.app.state.services
        return Capabilities(google=s.places.source == "google", llm=s.llm is not None, agent=s.agent_enabled)

    for r in (health, profiles_router, collections_router, places_router, destinations_router, trips_router, planning_router, adjustments_router):
        app.include_router(r)
    return app


app = create_app()
