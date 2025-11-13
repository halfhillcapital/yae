from enum import Enum

from pydantic import BaseModel

class ChatPlatform(str, Enum):
    DISCORD = "discord"
    LOCAL = "local"

class ChatInterface(str, Enum):
    TEXT = 'text'
    VOICE = 'voice'

class ChatMessage(BaseModel):
    identifier: str
    content: str