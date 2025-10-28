import pytest
import pytest_asyncio
import asyncio
from typing import AsyncGenerator
from sqlmodel.ext.asyncio.session import AsyncSession

from yae.database import DatabaseManager

@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest_asyncio.fixture(scope="function")
async def test_db() -> AsyncGenerator[DatabaseManager, None]:
    """Create a test database with fresh tables for each test"""
    # Use in-memory SQLite for testing
    test_db_url = "sqlite+aiosqlite:///:memory:"
    
    # Create test database manager
    db_manager = DatabaseManager(test_db_url)
    
    # Create tables
    await db_manager.init_db()
    
    yield db_manager
    
    # Cleanup is handled automatically since we're using in-memory DB

@pytest_asyncio.fixture
async def test_session(test_db: DatabaseManager) -> AsyncGenerator[AsyncSession, None]:
    """Get a test database session"""
    async with test_db.get_session() as session:
        yield session
