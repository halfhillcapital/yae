from yae.database.models import Role
from yae.database.services import UserService, SessionService, DatabaseServices


class TestUserService:
    """Test UserService"""
    
    async def test_create_user(self, test_session):
        """Test creating a user"""
        user_service = UserService(test_session)
        
        user = await user_service.create_user(
            name="Test User",
            discord_id="123456789"
        )
        
        assert user.id is not None
        assert user.name == "Test User"
        assert user.role == Role.USER
        assert user.discord_id == "123456789"
    
    async def test_get_user_by_id(self, test_session):
        """Test getting a user by ID"""
        user_service = UserService(test_session)
        
        # Create a user first
        created_user = await user_service.create_user(
            name="Test User"
        )
        
        # Get the user by ID
        retrieved_user = await user_service.by_id(created_user.id)
        
        assert retrieved_user is not None
        assert retrieved_user.id == created_user.id
        assert retrieved_user.name == "Test User"
    
    async def test_get_user_by_discord_id(self, test_session):
        """Test getting a user by Discord ID"""
        user_service = UserService(test_session)
        
        # Create a user with Discord ID
        created_user = await user_service.create_user(
            name="Discord User",
            discord_id="discord_123"
        )
        
        # Get the user by Discord ID
        retrieved_user = await user_service.by_discord("discord_123")
        
        assert retrieved_user is not None
        assert retrieved_user.id == created_user.id
        assert retrieved_user.discord_id == "discord_123"
    
    async def test_update_user(self, test_session):
        """Test updating a user"""
        user_service = UserService(test_session)
        
        # Create a user first
        user = await user_service.create_user(
            name="Original Name"
        )
        
        # Update the user
        updated_user = await user_service.update_user(
            user.id,
            name="Updated Name"
        )
        
        assert updated_user is not None
        assert updated_user.name == "Updated Name"
    
    async def test_delete_user(self, test_session):
        """Test deleting a user"""
        user_service = UserService(test_session)
        
        # Create a user first
        user = await user_service.create_user(
            name="To Delete"
        )
        
        # Delete the user
        success = await user_service.delete_user(user.id)
        assert success is True
        
        # Verify user is gone
        deleted_user = await user_service.by_id(user.id)
        assert deleted_user is None


class TestSessionService:
    """Test SessionService"""
    
    async def test_create_session(self, test_session):
        """Test creating a session"""
        user_service = UserService(test_session)
        session_service = SessionService(test_session)
        
        # Create a user first
        user = await user_service.create_user(
            name="Test User"
        )
        
        # Create a session for the user
        session = await session_service.create_session(user.id)
        
        assert session is not None
        assert session.id is not None
        assert session.owner_id == user.id
        assert session.external_id is not None
    
    async def test_get_session_by_id(self, test_session):
        """Test getting a session by ID"""
        user_service = UserService(test_session)
        session_service = SessionService(test_session)
        
        # Create a user and session
        user = await user_service.create_user(
            name="Test User"
        )
        created_session = await session_service.create_session(user.id)
        assert created_session is not None
        
        # Get the session by ID
        retrieved_session = await session_service.by_id(created_session.id)
        
        assert retrieved_session is not None
        assert retrieved_session.id == created_session.id
        assert retrieved_session.owner_id == user.id
    
    async def test_get_session_by_external_id(self, test_session):
        """Test getting a session by external ID"""
        user_service = UserService(test_session)
        session_service = SessionService(test_session)
        
        # Create a user and session
        user = await user_service.create_user(
            name="Test User"
        )
        created_session = await session_service.create_session(user.id)
        assert created_session is not None
        
        # Get the session by external ID
        retrieved_session = await session_service.by_uuid(created_session.external_id)
        
        assert retrieved_session is not None
        assert retrieved_session.id == created_session.id
        assert retrieved_session.external_id == created_session.external_id
    
    async def test_add_message_to_session(self, test_session):
        """Test adding a message to a session"""
        user_service = UserService(test_session)
        session_service = SessionService(test_session)
        
        # Create a user and session
        user = await user_service.create_user(
            name="Test User"
        )
        session = await session_service.create_session(user.id)
        assert session is not None
        
        # Add a message to the session
        message = await session_service.add_message(
            session=session,
            user=user,
            content="Hello, world!"
        )
        
        assert message is not None
        assert message.id is not None
        assert message.content == "Hello, world!"
        assert message.user_id == user.id
        assert message.session_id == session.id
    
    async def test_get_session_messages(self, test_session):
        """Test getting messages from a session"""
        user_service = UserService(test_session)
        session_service = SessionService(test_session)
        
        # Create a user and session
        user = await user_service.create_user(
            name="Test User"
        )
        session = await session_service.create_session(user.id)
        assert session is not None
        
        # Add multiple messages
        await session_service.add_message(
            session=session,
            user=user,
            content="First message"
        )
        await session_service.add_message(
            session=session,
            user=user,
            content="Second message"
        )
        
        # Get all messages
        messages = await session_service.get_messages(session.id)
        
        assert len(messages) == 2
        assert messages[0].content == "First message"
        assert messages[1].content == "Second message"

    async def test_get_session_last_messages(self, test_session):
        """Test getting last n messages from a session"""
        user_service = UserService(test_session)
        session_service = SessionService(test_session)

        user = await user_service.create_user(name="Test User")
        session = await session_service.create_session(user.id)
        assert session is not None

        messages = await session_service.get_last_messages(session.id, 2)
        assert messages is not None
        assert len(messages) == 0
        
        # Add multiple messages
        await session_service.add_message(
            session=session,
            user=user,
            content="First message"
        )
        await session_service.add_message(
            session=session,
            user=user,
            content="Second message"
        )
        await session_service.add_message(
            session=session,
            user=user,
            content="Third message"
        )
        await session_service.add_message(
            session=session,
            user=user,
            content="Fourth message"
        )

        messages = await session_service.get_last_messages(session.id, 2)
        assert len(messages) == 2
        assert messages[0].content == "Third message"
        assert messages[1].content == "Fourth message"

    
    async def test_delete_session(self, test_session):
        """Test deleting a session"""
        user_service = UserService(test_session)
        session_service = SessionService(test_session)
        
        # Create a user and session
        user = await user_service.create_user(
            name="Test User"
        )
        session = await session_service.create_session(user.id)
        assert session is not None
        
        # Delete the session
        success = await session_service.delete_session(session.id)
        assert success is True
        
        # Verify session is gone
        deleted_session = await session_service.by_id(session.id)
        assert deleted_session is None


class TestDatabaseServices:
    """Test DatabaseServices container"""
    
    async def test_shared_session(self, test_session):
        """Test that services share the same session"""
        db_services = DatabaseServices(test_session)
        
        # Create a user through the user service
        user = await db_services.users.create_user(
            name="Test User"
        )
        
        # Create a session through the session service
        session = await db_services.sessions.create_session(user.id)
        assert session is not None
        
        # Add a message through the session service
        message = await db_services.sessions.add_message(
            session=session,
            user=user,
            content="Test message"
        )
        
        # Verify all entities exist and are related
        assert user is not None
        assert session is not None
        assert message is not None
        assert session.owner_id == user.id
        assert message.user_id == user.id
        assert message.session_id == session.id
        
        # Test that we can retrieve the user through the same session
        retrieved_user = await db_services.users.by_id(user.id)
        assert retrieved_user is not None
        assert retrieved_user.id == user.id
        
        # Test that we can retrieve the session through the same session
        retrieved_session = await db_services.sessions.by_id(session.id)
        assert retrieved_session is not None
        assert retrieved_session.id == session.id