from dataclasses import dataclass

from yae.utils import required_env
from yae.errors import MissingEnvironmentVariableError

@dataclass
class AppConfig:
    LOCAL_URL: str
    LOCAL_TAG: str
    REMOTE_TAG: str
    OPENROUTER_API: str

    @classmethod
    def from_env(cls) -> "AppConfig":
        try:
            LOCAL_URL = required_env("LOCAL_URL", "http://127.0.0.1:11434/v1")
            LOCAL_TAG  = required_env("LOCAL_IDENTIFIER", "pocketdoc_dans-personalityengine-v1.3.0-24b")
            REMOTE_TAG = required_env("REMOTE_IDENTIFIER", "z-ai/glm-4.5-air:free")
            OPENROUTER_API = required_env("OPENROUTER_API_KEY")
        except (MissingEnvironmentVariableError, FileNotFoundError) as e:
            print(f"Error: {e}")
            exit(1)
        return cls(
            LOCAL_URL=LOCAL_URL,
            LOCAL_TAG=LOCAL_TAG,
            REMOTE_TAG=REMOTE_TAG,
            OPENROUTER_API=OPENROUTER_API
        )