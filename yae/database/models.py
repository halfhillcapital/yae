import uuid
from enum import Enum
from typing import Optional
from datetime import datetime, timezone

from sqlmodel import SQLModel, Field, Relationship

def get_utc_now() -> datetime:
    return datetime.now(timezone.utc)

class Role(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"

class User(SQLModel, table=True):
    __tablename__ = "users" #type: ignore
    id: Optional[int] = Field(default=None, primary_key=True)
    role: Role = Role.USER
    name: str
    info: str

    # Discord
    discord_id: Optional[str] = Field(default=None, unique=True, index=True)
    discord_username: Optional[str] = None

    # Relationships
    messages: Optional[list["Message"]] = Relationship(back_populates="user", cascade_delete=True)
    sessions: Optional[list["Session"]] = Relationship(back_populates="owner", cascade_delete=True)

class Message(SQLModel, table=True):
    __tablename__ = "messages" #type: ignore
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=get_utc_now)
    content: str

    # Foreign Keys
    user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    session_id: Optional[uuid.UUID] = Field(default=None, foreign_key="sessions.id")

    # Relationships
    user: User = Relationship(back_populates="messages", sa_relationship_kwargs={"lazy": "selectin"})
    session: "Session" = Relationship(back_populates="messages", sa_relationship_kwargs={"lazy": "selectin"})

class Session(SQLModel, table=True):
    __tablename__ = "sessions" #type: ignore
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=get_utc_now)
    updated_at: datetime = Field(default_factory=get_utc_now, sa_column_kwargs={"onupdate": get_utc_now})

    # Foreign Keys
    owner_id: Optional[int] = Field(default=None, foreign_key="users.id")

    # Relationships
    owner: User = Relationship(back_populates="sessions", sa_relationship_kwargs={"lazy": "selectin"})
    messages: Optional[list[Message]] = Relationship(back_populates="session")