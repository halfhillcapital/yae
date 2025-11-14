from uuid import UUID
from typing import Optional

from pydantic import BaseModel
from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import StreamingResponse

import yae.utils as utils
from yae.agents import AgentService, get_agent_service
from yae.database import DatabaseServices, get_db_services
from yae.database.models import Session

from .models import ChatMessage, ChatPlatform, ChatInterface


router = APIRouter()

class ChatRequest(BaseModel):
    message: ChatMessage
    interface: ChatInterface = ChatInterface.TEXT
    platform: ChatPlatform = ChatPlatform.LOCAL
    session: UUID
    attachments: Optional[list[str]]

async def save_messages(assistant_response: str, session: Session, db_services: DatabaseServices):
    yae = await db_services.users.by_id(1)
    if not yae:
        return

    await db_services.sessions.add_message(assistant_response, session, yae)


#TODO: Look for ways to stream only the delta
#TODO: Do not assume that the request comes from Discord
@router.post("/chat")
async def post_chat(
    request: ChatRequest,
    tasks: BackgroundTasks,
    db_services: DatabaseServices = Depends(get_db_services),
    agent_service: AgentService = Depends(get_agent_service)
    ) -> StreamingResponse:

    user = await db_services.users.by_discord(request.message.identifier)
    session = await db_services.sessions.by_uuid(request.session)

    if not user:
        return StreamingResponse(utils.stream_text("You are not registered!"))

    if not session:
        return StreamingResponse(utils.stream_text("No valid session found!"))
    
    user_message = await db_services.sessions.add_message(request.message.content, session, user)
    messages = await db_services.sessions.get_last_messages(session.id, 10)

    if not user_message:
        return StreamingResponse(utils.stream_text("There is something wrong with your message!"))

    async def collect_and_stream():
        full_response = ""
        match request.interface:
            case ChatInterface.TEXT:
                agent = agent_service.run_text_agent(messages)
            case ChatInterface.VOICE:
                agent = agent_service.run_voice_agent(messages)

        async for chunk in agent:
            full_response += chunk
            yield chunk

        tasks.add_task(save_messages, full_response, session, db_services)

    return StreamingResponse(collect_and_stream(), media_type="text/event-stream")