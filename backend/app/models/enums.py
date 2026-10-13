from enum import StrEnum


class FixtureStatus(StrEnum):
    SCHEDULED = "scheduled"
    LIVE = "live"
    FINISHED = "finished"
    POSTPONED = "postponed"
    CANCELLED = "cancelled"


class MarketType(StrEnum):
    MATCH_RESULT = "match_result"  # 1X2
    MONEYLINE = "moneyline"  # 2-way winner
    TOTAL = "total"
    HANDICAP = "handicap"
    BTTS = "btts"
    PLAYER_PROP = "player_prop"
    TEAM_PROP = "team_prop"


class SyncStatus(StrEnum):
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    PARTIAL = "partial"
    FAILED = "failed"


class EntityType(StrEnum):
    SPORT = "sport"
    LEAGUE = "league"
    TEAM = "team"
    PLAYER = "player"
    FIXTURE = "fixture"
    BOOKMAKER = "bookmaker"


def check_in(column: str, enum: type[StrEnum]) -> str:
    """SQL CHECK expression restricting a text column to an enum's values."""
    values = ", ".join(f"'{e.value}'" for e in enum)
    return f"{column} IN ({values})"
