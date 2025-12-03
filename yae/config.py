from dataclasses import dataclass

from yae.utils import required_env, required_prompts
from yae.errors import MissingEnvironmentVariableError

@dataclass
class AppConfig:
    YAE_NAME: str
    YAE_DISCORD_ID: str
    YAE_DISCORD_USERNAME: str
    ADMIN_NAME: str
    ADMIN_DISCORD_ID: str
    ADMIN_DISCORD_USERNAME: str

    LOCAL_URL: str
    LOCAL_TAG: str
    REMOTE_TAG: str
    OPENROUTER_API: str

    PERSONA: str
    RULES: str

    @classmethod
    def from_env(cls) -> "AppConfig":
        try:
            YAE_NAME = required_env("YAE_NAME")
            YAE_DISCORD_ID = required_env("YAE_DISCORD_ID")
            YAE_DISCORD_USERNAME = required_env("YAE_DISCORD_USERNAME")
            ADMIN_NAME = required_env("ADMIN_NAME")
            ADMIN_DISCORD_ID = required_env("ADMIN_DISCORD_ID")
            ADMIN_DISCORD_USERNAME = required_env("ADMIN_DISCORD_USERNAME")
            LOCAL_URL = required_env("LOCAL_URL", "http://127.0.0.1:11434/v1")
            LOCAL_TAG  = required_env("LOCAL_IDENTIFIER", "unsloth/gemma-3-12b-it")
            REMOTE_TAG = required_env("REMOTE_IDENTIFIER", "x-ai/grok-4.1-fast:free")
            OPENROUTER_API = required_env("OPENROUTER_API_KEY")

            PERSONA = required_prompts("persona.md")
            RULES = required_prompts("rules.md")
        except (MissingEnvironmentVariableError, FileNotFoundError) as e:
            print(f"Error: {e}")
            exit(1)
        return cls(
            YAE_NAME = YAE_NAME,
            YAE_DISCORD_ID = YAE_DISCORD_ID,
            YAE_DISCORD_USERNAME = YAE_DISCORD_USERNAME,
            ADMIN_NAME = ADMIN_NAME,
            ADMIN_DISCORD_ID = ADMIN_DISCORD_ID,
            ADMIN_DISCORD_USERNAME = ADMIN_DISCORD_USERNAME,
            LOCAL_URL=LOCAL_URL,
            LOCAL_TAG=LOCAL_TAG,
            REMOTE_TAG=REMOTE_TAG,
            OPENROUTER_API=OPENROUTER_API,
            PERSONA=PERSONA,
            RULES=RULES
        )