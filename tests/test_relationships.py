from yae.database.models import User, Message, Session, Role

class TestModelRelationships:
    """Test relationships between models"""
    
    async def test_user_relationships(self, test_session):
        """Test user-messages relationship"""

        user1 = User(name="Test User", role=Role.USER)
        user2 = User(name="Another User", role=Role.USER)
        session = Session(owner=user1)
        
        message1 = Message(
            content="Message 1",
            user=user1,
            session=session
        )
        message2 = Message(
            content="Message 2",
            user=user2,
            session=session
        )
        message3 = Message(
            content="Message 3",
            user=user1,
            session=session
        )

        test_session.add(message1)
        test_session.add(message2)
        test_session.add(message3)
        await test_session.commit()
        
        # Test relationship
        assert user1.id is not None
        assert user2.id is not None
        assert session.id is not None
        assert user1.messages is not None
        assert user1.sessions is not None
        assert user2.messages is not None
        assert session.messages is not None
        assert len(user1.messages) == 2
        assert len(user2.messages) == 1
        assert user1.messages[0].content in ["Message 1", "Message 3"]
        assert user2.messages[0].content == "Message 2"

        assert len(session.messages) == 3
        assert user1.sessions[0] == session

    async def test_session_relationships(self, test_session):
        """Test session-messages relationship"""

        user = User(name="Test User", role=Role.USER)
        session1 = Session(owner=user)
        session2 = Session(owner=user)
        
        message1 = Message(
            content="Session 1 - Message 1",
            user=user,
            session=session1
        )
        message2 = Message(
            content="Session 1 - Message 2",
            user=user,
            session=session1
        )
        message3 = Message(
            content="Session 2 - Message 1",
            user=user,
            session=session2
        )

        test_session.add(message1)
        test_session.add(message2)
        test_session.add(message3)
        await test_session.commit()
        
        # Test relationship
        assert user.id is not None
        assert user.sessions is not None
        assert session1.id is not None
        assert session2.id is not None
        assert session1.messages is not None
        assert session2.messages is not None
        assert len(session1.messages) == 2
        assert len(session2.messages) == 1
        assert session1.messages[0].content in ["Session 1 - Message 1", "Session 1 - Message 2"]
        assert session2.messages[0].content == "Session 2 - Message 1"

        assert len(user.sessions) == 2
        assert user.sessions[0] == session1
        assert user.sessions[1] == session2