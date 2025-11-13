from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from yae.database import get_db_services
from yae.database.models import Visibility

from .models import ChatMessage, ChatPlatform


class MessageResponse(BaseModel):
    name: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True

class SessionResponse(BaseModel):
    uuid: UUID
    created_at: datetime
    updated_at: datetime
    owner: str

    class Config:
        from_attributes = True

class CreateSessionRequest(BaseModel):
    identifier: str
    platform: ChatPlatform
    visibility: Visibility

class AddMessageRequest(BaseModel):
    message: ChatMessage
    platform: ChatPlatform

router = APIRouter()

@router.post("/sessions", response_model=SessionResponse)
async def create_session(
    request: CreateSessionRequest,
    db_services = Depends(get_db_services)
):
    """Create a new session for a user"""
    user = await db_services.users.by_discord(request.identifier)
    if not user:
        raise HTTPException(status_code=404, detail=f"User ({request.identifier}) not found")
    session = await db_services.sessions.create_session(user.id, request.visibility)
    if not session:
        raise HTTPException(status_code=500, detail="Session not created")
    
    response = SessionResponse(
        uuid=session.external_id,
        created_at=session.created_at,
        updated_at=session.updated_at,
        owner=user.name
    )
    return response

@router.post("sessions/{session_uuid}", response_model=MessageResponse)
async def add_message(
    request: AddMessageRequest, 
    session_uuid: UUID,
    db_services = Depends(get_db_services)
):
    """Add message to session without LLM inference."""
    content = request.message.content
    user = await db_services.users.by_discord(request.message.identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    session = await db_services.sessions.by_uuid(session_uuid)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    message = await db_services.sessions.add_message(content, session, user)
    if not message:
        raise HTTPException(status_code=500, detail="Session not created")
    
    return message
    

@router.get("/sessions/{session_uuid}", response_model=list[MessageResponse])
async def get_session(
    session_uuid: UUID,
    db_services = Depends(get_db_services)
):
    """Get all messages of a session by its UUID"""
    session = await db_services.sessions.by_uuid(session_uuid)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@router.get("/users/{user_id}/sessions", response_model=list[SessionResponse])
async def get_user_sessions(
    user_id: int,
    db_services = Depends(get_db_services)
):
    """Get all sessions for a specific user"""
    response = []
    user = await db_services.users.by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    sessions = await db_services.sessions.by_owner(user_id)
    for session in sessions:
        temp = SessionResponse(
            uuid=session.external_id,
            created_at=session.created_at,
            updated_at=session.updated_at,
            owner=user.name
        )
        response.append(temp)
    return response

@router.get("/sessions", response_model=list[SessionResponse])
async def get_all_sessions(
    db_services = Depends(get_db_services)
):
    """Get all sessions"""
    sessions = await db_services.sessions.all()
    response = []
    for session in sessions:
        temp = SessionResponse(
            uuid=session.external_id,
            created_at=session.created_at,
            updated_at=session.updated_at,
            owner=session.owner.name
        )
        response.append(temp)
    return response