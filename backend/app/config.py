"""Application configuration loaded from environment variables (.env supported)."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- General -----------------------------------------------------------
    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    log_email_bodies: bool = False  # never enable in production
    api_base_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:5173"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"])

    # --- Supabase ----------------------------------------------------------
    supabase_url: str = "http://127.0.0.1:55321"
    supabase_service_role_key: SecretStr = SecretStr("")
    supabase_jwt_secret: SecretStr = SecretStr("")  # legacy HS256 projects only
    supabase_jwt_audience: str = "authenticated"
    database_url: SecretStr = SecretStr("postgresql+asyncpg://postgres:postgres@127.0.0.1:55322/postgres")
    database_pool_size: int = 10
    database_statement_cache_size: int = 100  # set 0 when using the transaction pooler (port 6543)
    attachments_bucket: str = "attachments"
    signed_url_ttl_seconds: int = 120

    # --- Security ----------------------------------------------------------
    token_encryption_key: SecretStr = SecretStr("")  # Fernet key (urlsafe base64, 32 bytes)
    rate_limit_per_minute: int = 120
    sensitive_rate_limit_per_minute: int = 20

    # --- Google / Gmail ----------------------------------------------------
    google_client_id: str = ""
    google_client_secret: SecretStr = SecretStr("")
    google_redirect_uri: str = "http://localhost:8000/api/v1/gmail/oauth/callback"
    gmail_api_base: str = "https://gmail.googleapis.com/gmail/v1"
    google_oauth_auth_url: str = "https://accounts.google.com/o/oauth2/v2/auth"
    google_oauth_token_url: str = "https://oauth2.googleapis.com/token"
    google_oauth_revoke_url: str = "https://oauth2.googleapis.com/revoke"
    gmail_max_retries: int = 5
    gmail_fetch_concurrency: int = 8
    sync_interval_minutes: int = 10

    # --- DGX Spark remote inference ------------------------------------------
    dgx_ssh_host: str = ""
    dgx_ssh_user: str = ""
    dgx_ssh_port: int = 22
    dgx_ssh_key_path: str = ""
    dgx_remote_llm_host: str = "127.0.0.1"
    dgx_remote_llm_port: int | None = None
    dgx_local_tunnel_port: int | None = None
    dgx_llm_api_base_url: str = ""  # e.g. http://127.0.0.1:18000/v1 (via SSH tunnel)
    dgx_llm_model: str = ""
    dgx_llm_api_key: SecretStr = SecretStr("")
    dgx_llm_api_style: Literal["openai"] = "openai"
    dgx_llm_structured_output: Literal["json_schema", "json_object", "prompt"] = "json_schema"
    llm_request_timeout: float = 90.0
    llm_connect_timeout: float = 5.0
    llm_max_concurrency: int = 4
    llm_max_retries: int = 2
    llm_max_input_chars: int = 24000
    llm_max_output_tokens: int = 1200
    llm_temperature: float = 0.1
    # When inference is unavailable: 'rules' stores a clearly labelled rule-based result
    # and requeues LLM analysis; 'queue' only requeues. Never falls back to a cloud model.
    llm_fallback_mode: Literal["rules", "queue"] = "rules"

    # --- Embeddings (optional, must also run on approved infrastructure) -----
    embedding_api_base_url: str = ""
    embedding_model: str = ""
    embedding_api_key: SecretStr = SecretStr("")

    # --- Attachments ---------------------------------------------------------
    attachment_hard_max_bytes: int = 25 * 1024 * 1024
    attachment_max_extract_chars: int = 100_000
    pdf_max_pages: int = 50
    ocr_enabled: bool = False
    tesseract_cmd: str = ""

    # --- Worker --------------------------------------------------------------
    worker_concurrency: int = 4
    worker_poll_interval: float = 2.0
    worker_lease_seconds: int = 300
    approval_ttl_hours: int = 24

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        if isinstance(v, str):
            stripped = v.strip()
            if stripped.startswith("["):
                return v
            return [o.strip() for o in stripped.split(",") if o.strip()]
        return v

    @property
    def llm_configured(self) -> bool:
        return bool(self.dgx_llm_api_base_url and self.dgx_llm_model)

    @property
    def gmail_configured(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret.get_secret_value())

    @property
    def embeddings_configured(self) -> bool:
        return bool(self.embedding_api_base_url and self.embedding_model)


@lru_cache
def get_settings() -> Settings:
    return Settings()
