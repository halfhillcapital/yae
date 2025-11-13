# tests/test_models.py
import pytest
import uuid
from datetime import datetime

from yae.database.models import User, Message, Session, Role

class TestUserModel:
    """Test User model"""
    
    async def test_user_creation(self, test_session):
        """Test creating a user"""
        user = User(
            name="Test User",
            discord_id="123456789",
            discord_username="testuser"
        )
        
        test_session.add(user)
        await test_session.commit()
        await test_session.refresh(user)
        
        assert user.id is not None
        assert user.name == "Test User"
        assert user.role == Role.USER
        assert user.discord_id == "123456789"
    
    async def test_user_unique_discord_id(self, test_session):
        """Test that discord_id must be unique"""
        user1 = User(
            name="User 1",
            role=Role.USER,
            discord_id="unique_id"
        )
        
        user2 = User(
            name="User 2",
            role=Role.USER,
            discord_id="unique_id"  # Same discord_id
        )
        
        test_session.add(user1)
        await test_session.commit()
        
        test_session.add(user2)
        with pytest.raises(Exception):  # Should raise an integrity error
            await test_session.commit()

class TestSessionModel:
    """Test Session model"""
    
    async def test_session_creation(self, test_session):
        """Test creating a session"""
        user = User(name="Test User", role=Role.USER)
        session = Session(owner=user)
        
        test_session.add(session)
        await test_session.commit()
        await test_session.refresh(session)
        
        assert session.id is not None
        assert session.external_id is not None
        assert isinstance(session.id, int)
        assert isinstance(session.external_id, uuid.UUID)
        assert isinstance(session.created_at, datetime)
        assert isinstance(session.updated_at, datetime)
        assert session.owner == user
        assert user.sessions is not None
        assert user.sessions[0] == session

class TestMessageModel:
    """Test Message model"""
    
    async def test_message_creation(self, test_session):
        """Test creating a message"""

        user = User(name="Test User", role=Role.USER)
        session = Session(owner=user)
        
        message = Message(
            content="Test message",
            user=user,
            session=session
        )
        
        test_session.add(message)
        await test_session.commit()
        await test_session.refresh(message)
        
        assert message.id is not None
        assert message.content == "Test message"
        assert message.user_id == user.id
        assert message.session_id == session.id
        assert isinstance(message.created_at, datetime)
