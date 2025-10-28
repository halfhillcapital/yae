from functools import lru_cache

from yae.config import AppConfig

@lru_cache()
def get_config() -> AppConfig:
    return AppConfig.from_env()