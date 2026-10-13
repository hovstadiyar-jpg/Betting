"""ORM models. Importing this package registers every table on Base.metadata."""

from app.models.fixtures import Fixture
from app.models.markets import Market, OddsCurrent, OddsObservation, Selection
from app.models.reference import Bookmaker, ExternalRef, League, Player, Sport, Team
from app.models.sync import ProviderSyncRun

__all__ = [
    "Bookmaker",
    "ExternalRef",
    "Fixture",
    "League",
    "Market",
    "OddsCurrent",
    "OddsObservation",
    "Player",
    "ProviderSyncRun",
    "Selection",
    "Sport",
    "Team",
]
