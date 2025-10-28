import os
from dotenv import load_dotenv
from contextlib import asynccontextmanager

import logfire
from fastapi import FastAPI

from yae.routes.chat import router as chat_router
from yae.routes.sessions import router as sessions_router

_ = load_dotenv()
_ = logfire.configure(token=os.getenv("LOGFIRE_TOKEN"))
logfire.instrument_pydantic_ai()

@asynccontextmanager
async def lifespan(_: FastAPI):
    # Startup code
    yield
    # Shutdown code

app = FastAPI(lifespan=lifespan)

# Include session routes
# app.include_router(chat_router, prefix="/v1", tags=["chat"])
# app.include_router(sessions_router, prefix="/v1", tags=["sessions"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8010)

#TODO: Implement the session and chat routes
#TODO: Implement database services
