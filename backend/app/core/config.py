"""Application settings, loaded from environment variables (and an optional .env file)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+psycopg://bettingvalue:bettingvalue@localhost:5432/bettingvalue"
    # Comma-separated list of origins allowed to call the API from a browser.
    cors_origins: str = "http://localhost:3000"

    # The Odds API (https://the-odds-api.com). Leave empty to disable the live provider.
    odds_api_key: SecretStr | None = None
    odds_api_base_url: str = "https://api.the-odds-api.com/v4"
    # Bookmaker regions and markets requested per sync. Each region x market costs quota.
    odds_api_regions: str = "uk,eu"
    odds_api_markets: str = "h2h,totals,spreads"
    odds_api_timeout_seconds: float = 15.0

    # A price not re-confirmed by a sync within this window is treated as withdrawn.
    odds_stale_after_minutes: int = Field(default=360, ge=5)

    # Value calculation defaults.
    value_min_books: int = Field(
        default=3, ge=2, description="Bookmakers required for a consensus fair price"
    )

    @field_validator("database_url")
    @classmethod
    def _use_psycopg_driver(cls, value: str) -> str:
        """Accept URLs as copied from Neon/Supabase/psql (postgres:// or postgresql://) and pin psycopg 3."""
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix) :]
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
