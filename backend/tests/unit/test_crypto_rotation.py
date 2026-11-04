import pytest
from cryptography.fernet import Fernet

from app.config import get_settings
from app.errors import NotConfiguredError
from app.security import crypto


def test_old_key_still_decrypts_after_rotation(monkeypatch: pytest.MonkeyPatch) -> None:
    old, new = Fernet.generate_key().decode(), Fernet.generate_key().decode()
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", old)
    get_settings.cache_clear()
    saved = crypto.encrypt("refresh-token")
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", new)
    get_settings.cache_clear()
    with pytest.raises(NotConfiguredError):
        crypto.decrypt(saved)
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", f"{new},{old}")
    get_settings.cache_clear()
    assert crypto.decrypt(saved) == "refresh-token"
    get_settings.cache_clear()
