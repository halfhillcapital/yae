import uuid
from enum import Enum
from typing import Optional
from datetime import datetime, timezone

from sqlalchemy import (
    String, Text, ForeignKey, Enum as SQLEnum, UUID, DateTime
)
from sqlalchemy.orm import (
    Mapped, mapped_column, relationship, DeclarativeBase, declared_attr
)

def get_utc_now() -> datetime:
    return datetime.now(timezone.utc)

class Base(DeclarativeBase):
    """Base class with common functionality for all models."""
    
    @declared_attr.directive
    def __tablename__(cls) -> str:
        """Automatically generate table names from class names."""
        return cls.__name__.lower() + 's'
    
    def __repr__(self) -> str:
        """String representation for debugging."""
        class_name = self.__class__.__name__
        if hasattr(self, 'id'):
            return f"<{class_name}(id={self.id})>" #type: ignore
        return f"<{class_name}>"

class Role(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"

class Visibility(str, Enum):
    PUBLIC = "public"
    PRIVATE = "private"
    SECRET = "secret"

class User(Base):
    id: Mapped[int] = mapped_column(primary_key=True)
    role: Mapped[Role] = mapped_column(SQLEnum(Role), default=Role.USER, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)

    # Discord
    discord_id: Mapped[Optional[str]] = mapped_column(String, unique=True, index=True, nullable=True)
    discord_username: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Relationships
    messages: Mapped[Optional[list["Message"]]] = relationship("Message", back_populates="user", cascade="all, delete-orphan", lazy="selectin")
    sessions: Mapped[Optional[list["Session"]]] = relationship("Session", back_populates="owner", cascade="all, delete-orphan", lazy="selectin")

class Message(Base):
    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=get_utc_now, index=True, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Foreign Keys
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True, nullable=False)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="messages", lazy="selectin")
    session: Mapped["Session"] = relationship("Session", back_populates="messages", lazy="selectin")

class Session(Base):
    id: Mapped[int] = mapped_column(primary_key=True)
    external_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, default=uuid.uuid4)
    visibility: Mapped[Visibility] = mapped_column(SQLEnum(Visibility), default=Visibility.PUBLIC, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=get_utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=get_utc_now, onupdate=get_utc_now, index=True, nullable=False)

    # Foreign Keys
    owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)

    # Relationships
    owner: Mapped["User"] = relationship("User", back_populates="sessions", lazy="selectin")
    messages: Mapped[Optional[list["Message"]]] = relationship("Message", back_populates="session", cascade="all, delete-orphan", lazy="selectin")