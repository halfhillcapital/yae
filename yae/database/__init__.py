import time
from typing import AsyncGenerator, Optional
from contextlib import asynccontextmanager

from fastapi import Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from yae.config import AppConfig
from .services import DatabaseServices


@asynccontextmanager
async def profile_query(session: AsyncSession, query_name: str):
    """Profile query execution time"""
    start_time = time.time()
    try:
        yield
    finally:
        elapsed = time.time() - start_time
        if elapsed > 0.1:  # Log slow queries
            print(f"Slow query detected: {query_name} took {elapsed:.3f}s")


class DatabaseManager:
    """Manages database connections and sessions"""
    
    def __init__(self, database_url: str):
        self.engine = create_async_engine(
            database_url, 
            echo=False,
            connect_args={
                "timeout": 30,
                "check_same_thread": False
            },
            pool_pre_ping=True,
            pool_recycle=3600
        )
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
    
    async def init_db(self, config: Optional[AppConfig] = None) -> None:
        """Initialize database tables"""
        from .models import Base, User, Role
        from sqlalchemy import select

        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

            await conn.execute(text("PRAGMA journal_mode=WAL"))
            await conn.execute(text("PRAGMA synchronous=NORMAL"))
            await conn.execute(text("PRAGMA cache_size=10000"))
            await conn.execute(text("PRAGMA temp_store=MEMORY"))
            await conn.execute(text("PRAGMA mmap_size=268435456"))

        async with self.get_session() as session:
            if not config:
                print("Error: Config not loaded.")
                return
            
            yae_check = await session.execute(select(User).where(User.role == Role.ASSISTANT))
            yae_exists = yae_check.scalar_one_or_none()

            admin_check = await session.execute(select(User).where(User.discord_id == config.ADMIN_DISCORD_ID))
            admin_exists = admin_check.scalar_one_or_none()

            if not yae_exists:
                yae = User(
                    name=config.YAE_NAME,
                    role=Role.ASSISTANT,
                    discord_id=config.YAE_DISCORD_ID,
                    discord_username=config.YAE_DISCORD_USERNAME
                )
                session.add(yae)
                await session.commit()

            if not admin_exists:
                admin = User(
                    name=config.ADMIN_NAME,
                    discord_id=config.ADMIN_DISCORD_ID,
                    discord_username=config.ADMIN_DISCORD_USERNAME
                )

                session.add(admin)
                await session.commit()

    async def optimize_db(self):
        """Run SQLite optimization commands"""
        async with self.engine.begin() as conn:
            await conn.execute(text("VACUUM"))
            await conn.execute(text("ANALYZE"))
            print("Database optimization completed.")


# Global database manager instance
_db_manager: DatabaseManager | None = None

def get_db(url: str = "sqlite+aiosqlite:///./yae.db") -> DatabaseManager:
    """Get or create database manager"""
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager(url)
    return _db_manager

# Dependency injection functions for FastAPI
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependency to get a database session"""
    db = get_db()
    async with db.get_session() as session:
        yield session

async def get_db_services(session: AsyncSession = Depends(get_db_session)) -> DatabaseServices:
    """Dependency to get all database services sharing the same session"""
    return DatabaseServices(session)