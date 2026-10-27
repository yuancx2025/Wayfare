from functools import lru_cache

from dotenv import load_dotenv
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_POSTGRES_PREFIXES = ("postgres://", "postgresql://", "postgresql+psycopg://")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str
    seed_demo_trip: bool = True

    # Server-side key (IP-restricted). Without it the API falls back to the bundled catalog + distance estimates.
    google_maps_api_key: str | None = None
    # Any `init_chat_model` spec, e.g. "openai:gpt-4.1-mini" or "anthropic:claude-sonnet-4-5".
    # Without it the planner uses the deterministic heuristic curator.
    llm_model: str | None = None
    llm_temperature: float = 0.4

    cors_origins: list[str] = Field(default_factory=lambda: ["*"])
    generation_timeout_s: float = 60.0
    curate_max_retries: int = 2
    place_cache_ttl_s: int = 6 * 3600
    proposal_ttl_s: int = 30 * 60
    default_user_id: str = "demo-user"

    # Clerk session verification. CLERK_JWT_KEY (the PEM public key) verifies tokens locally without a network
    # call; CLERK_SECRET_KEY is the fallback and fetches Clerk's signing keys instead.
    clerk_secret_key: str | None = None
    clerk_jwt_key: str | None = None
    # The Clerk Frontend API URL, e.g. https://your-app.clerk.accounts.dev. Tokens from any other issuer are rejected.
    clerk_issuer: str | None = None
    # Web origins allowed to send tokens (matched against the token's `azp`). Native apps send no origin.
    clerk_authorized_parties: list[str] = Field(default_factory=list)

    @field_validator("database_url")
    @classmethod
    def require_postgres(cls, value: str) -> str:
        if value.startswith(_POSTGRES_PREFIXES):
            return value
        raise ValueError(
            "DATABASE_URL must be a PostgreSQL URL (postgres://, postgresql://, or postgresql+psycopg://)."
        )


@lru_cache
def get_settings() -> Settings:
    # LangChain providers read their keys (OPENAI_API_KEY, ANTHROPIC_API_KEY, ...) from the process
    # environment, which pydantic-settings does not populate from .env.
    load_dotenv(".env", override=False)
    return Settings()
