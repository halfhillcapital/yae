from enum import Enum
from datetime import datetime
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from yae.agents import AgentFactory
# from yae.utils import convertToPydanticAI

class ChatPlatform(str, Enum):
    DISCORD = "discord"
    LOCAL = "local"

class ChatMessage(BaseModel):
    created_at: datetime
    content: str

class ChatRequest(BaseModel):
    identifier: str
    platform: ChatPlatform = ChatPlatform.DISCORD
    message: ChatMessage
    attachments: Optional[list[str]]
    context: Optional[list[ChatMessage]]

router = APIRouter()

# Pretty hacky, later we should split Chat and Voice routes
@router.post("/chat")
async def post_chat(request: ChatRequest, agent = Depends(AgentFactory.create_chat_agent)) -> StreamingResponse:
    history = []
    # history = convertToPydanticAI(history)

    dep = None  # Replace with actual dependency injection for YaeContext

    async def token_streamer() -> AsyncGenerator[str, None]:
        # Build prompt with context if provided
        prompt = request.message.content
        if request.context:
            context_messages = "\n".join([msg.content for msg in request.context])
            prompt = f"Context:\n{context_messages}\n\nCurrent message:\n{prompt}"
        
        async with agent.run_stream(prompt, deps=dep, message_history=history) as result:
            async for token in result.stream_text(delta=True):
                yield token

    return StreamingResponse(token_streamer(), media_type="text/event-stream")