from typing import Optional

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

class UserResponse(BaseModel):
    name: str
    role: str
    discord_id: Optional[str] = None
    discord_username: Optional[str] = None

    class Config:
        from_attributes = True

router = APIRouter()