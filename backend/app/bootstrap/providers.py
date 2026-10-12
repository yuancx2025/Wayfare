from app.core.config import Settings
from app.db.session import get_sessionmaker
from app.integrations.cache import PlaceCache
from app.integrations.llm.client import get_chat_model
from app.integrations.places.catalog import CatalogPlaceProvider
from app.integrations.places.google import GooglePlaceProvider
from app.integrations.places.google_client import GooglePlacesClient
from app.integrations.routing.estimates import EstimateTravelRouter
from app.integrations.routing.google import GoogleTravelRouter
from app.integrations.routing.google_client import GoogleRoutesClient
from app.integrations.services import Services


def build_services(settings: Settings) -> Services:
    llm = get_chat_model(settings)
    cache = PlaceCache(get_sessionmaker(), settings.place_cache_ttl_s)
    if not settings.google_maps_api_key:
        return Services(places=CatalogPlaceProvider(), router=EstimateTravelRouter(), llm=llm, cache=cache)
    places_client = GooglePlacesClient(settings.google_maps_api_key)
    routes_client = GoogleRoutesClient(settings.google_maps_api_key)
    return Services(
        places=GooglePlaceProvider(places_client, cache),
        router=GoogleTravelRouter(routes_client, cache),
        llm=llm,
        cache=cache,
        closers=[places_client.aclose, routes_client.aclose],
    )
