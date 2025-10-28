from typing import AsyncGenerator
from contextlib import asynccontextmanager

from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

class DatabaseManager:
    """Manages database connections and sessions"""
    
    def __init__(self, database_url: str):
        self.engine = create_async_engine(database_url, echo=True)
        self.session_factory = async_sessionmaker(
            bind=self.engine,
            class_=AsyncSession,
            expire_on_commit=False
        )
    
    @asynccontextmanager
    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        """Get a database session with automatic cleanup"""
        async with self.session_factory() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()
    
    async def init_db(self) -> None:
        """Initialize database tables"""
        from .models import SQLModel
        async with self.engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)

# Global database manager instance (this is acceptable as it's a singleton)
_db_manager: DatabaseManager | None = None

def get_db(url: str = "sqlite+aiosqlite:///./yae.db") -> DatabaseManager:
    """Get or create database manager"""
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager(url)
    return _db_manager