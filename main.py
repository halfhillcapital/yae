import os
from dotenv import load_dotenv
from contextlib import asynccontextmanager

import logfire
from fastapi import FastAPI
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from yae.database import get_db
from yae.routes.chat import router as chat_router
from yae.routes.users import router as users_router
from yae.routes.sessions import router as sessions_router

_ = load_dotenv()
_ = logfire.configure(token=os.getenv("LOGFIRE_TOKEN"))
logfire.instrument_pydantic_ai()

scheduler = AsyncIOScheduler()

async def database_task():
    db = get_db()
    try:
        await db.optimize_db()
        print("Database optimization task completed.")
    except Exception as e:
        print(f"Error optimizing database: {e}")

@asynccontextmanager
async def lifespan(_: FastAPI):
    # Startup Code
    from yae import get_config
    db = get_db()
    config = get_config()
    await db.init_db(config)

    scheduler.add_job(
        database_task,
        trigger=IntervalTrigger(hours=24),
        replace_existing=True
    )
    scheduler.start()

    yield

    # Shutdown code
    scheduler.shutdown()
    from yae.agents import get_agent_service
    agent_service = get_agent_service()
    await agent_service.shutdown()

app = FastAPI(lifespan=lifespan)

# Include session routes
app.include_router(chat_router, prefix="/v1", tags=["chat"])
app.include_router(users_router, prefix="/v1", tags=["users"])
app.include_router(sessions_router, prefix="/v1", tags=["sessions"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8010)
