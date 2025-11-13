import os
from dotenv import load_dotenv
from contextlib import asynccontextmanager

import logfire
from fastapi import FastAPI

from yae import get_config
from yae.database import get_db
from yae.routes.chat import router as chat_router
from yae.routes.sessions import router as sessions_router

_ = load_dotenv()
_ = logfire.configure(token=os.getenv("LOGFIRE_TOKEN"))
logfire.instrument_pydantic_ai()

@asynccontextmanager
async def lifespan(_: FastAPI):
    # Startup Code
    db = get_db()
    config = get_config()
    await db.init_db(config)

    yield

    # Shutdown code
    from yae.agents import get_agent_service
    agent_service = get_agent_service()
    await agent_service.shutdown()

app = FastAPI(lifespan=lifespan)

# Include session routes
app.include_router(chat_router, prefix="/v1", tags=["chat"])
app.include_router(sessions_router, prefix="/v1", tags=["sessions"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8010)
