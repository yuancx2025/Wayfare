"""Imports every ORM model so `Base.metadata` is complete before `create_all`.

Add new model modules here. A model that is never imported is invisible to database initialization.
"""

from app.db.base import Base
from app.features.adjustments.models import ProposalRow
from app.features.collections.models import SavedPlaceRow
from app.features.discovery.models import DestinationRow
from app.features.profiles.models import User
from app.features.trips.models import TripRow
from app.integrations.cache import PlaceCacheRow

__all__ = ["Base", "DestinationRow", "PlaceCacheRow", "ProposalRow", "SavedPlaceRow", "TripRow", "User"]
