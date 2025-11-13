from uuid import UUID
from typing import Optional

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from .models import User, Session, Message, Role, Visibility


class UserService:
    """Service for managing user operations"""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def by_id(self, user_id: int) -> Optional[User]:
        """Get a user by their ID"""
        stmt = select(User).where(User.id == user_id)
        return await self.session.scalar(stmt)
    
    async def by_discord(self, discord_id: str) -> Optional[User]:
        """Get a user by their Discord ID"""
        stmt = select(User).where(User.discord_id == discord_id)
        return await self.session.scalar(stmt)
    
    async def all(self) -> list[User]:
        """Get all users"""
        stmt = select(User)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
    
    async def create_user(
        self, 
        name: str,
        role: Role = Role.USER,
        discord_id: Optional[str] = None,
        discord_username: Optional[str] = None
    ) -> User:
        """Create a new user"""
        user = User(
            name=name,
            role=role,
            discord_id=discord_id,
            discord_username=discord_username
        )
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        return user
    
    async def update_user(
        self, 
        user_id: int, 
        name: Optional[str] = None,
        role: Optional[Role] = None,
        discord_id: Optional[str] = None,
        discord_username: Optional[str] = None
    ) -> Optional[User]:
        """Update a user's information"""
        user = await self.by_id(user_id)
        if not user:
            return None
            
        if name is not None:
            user.name = name
        if role is not None:
            user.role = role
        if discord_id is not None:
            user.discord_id = discord_id
        if discord_username is not None:
            user.discord_username = discord_username
            
        await self.session.commit()
        await self.session.refresh(user)
        return user
    
    async def delete_user(self, user_id: int) -> bool:
        """Delete a user"""
        user = await self.by_id(user_id)
        if not user:
            return False
            
        await self.session.delete(user)
        await self.session.commit()
        return True


class SessionService:
    """Service for managing session operations"""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        
    async def by_id(self, session_id: int) -> Optional[Session]:
        """Get a session by its ID"""
        stmt = select(Session).where(Session.id == session_id)
        return await self.session.scalar(stmt)
    
    async def by_uuid(self, uuid: UUID) -> Optional[Session]:
        """Get a session by its external UUID"""
        stmt = select(Session).where(Session.external_id == uuid)
        return await self.session.scalar(stmt)
    
    async def by_owner(self, owner_id: int) -> list[Session]:
        """Get all sessions for a specific user"""
        stmt = select(Session).where(Session.owner_id == owner_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
    
    async def all(self) -> list[Session]:
        """Get all sessions"""
        stmt = select(Session)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
    
    async def add_message(
        self,
        content: str,
        session: Session, 
        user: User
    ) -> Optional[Message]:
        """Add a message to a session"""
          
        message = Message(
            content=content,
            user=user,
            session=session
        )
        self.session.add(message)
        
        await self.session.commit()
        await self.session.refresh(message)
        return message
    
    async def add_messages(self, messages: list[Message]):
        self.session.add_all(messages)
        await self.session.commit()
        for message in messages:
            await self.session.refresh(message)
    
    async def get_messages(self, session_id: int) -> list[Message]:
        """Get all messages in a session"""
        stmt = select(Message).where(Message.session_id == session_id).order_by(Message.created_at)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
    
    async def get_last_messages(self, session_id: int, n: int) -> list[Message]:
        """Get the last n messages."""
        stmt = (
            select(Message)
            .where(Message.session_id == session_id)
            .order_by(desc(Message.created_at))
            .limit(n))
        result = await self.session.execute(stmt)
        messages = list(result.scalars().all())
        messages.reverse()
        return messages
    
    async def create_session(self, owner_id: int, visibility: Visibility = Visibility.PUBLIC) -> Optional[Session]:
        """Create a new session for a user"""

        stmt = select(User).where(User.id == owner_id)
        owner = await self.session.scalar(stmt)
        if not owner:
            return None
            
        session = Session(owner_id=owner_id, visibility=visibility)
        self.session.add(session)
        await self.session.commit()
        await self.session.refresh(session)
        return session
    
    async def delete_session(self, session_id: int) -> bool:
        """Delete a session (and all its messages)"""
        session = await self.by_id(session_id)
        if not session:
            return False
            
        await self.session.delete(session)
        await self.session.commit()
        return True


class DatabaseServices:
    """Container for all database services that share the same session"""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.users = UserService(session)
        self.sessions = SessionService(session)