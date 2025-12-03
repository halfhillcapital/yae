from typing import Optional

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status

from yae.database import get_db_services
from yae.database.models import Role

class UserResponse(BaseModel):
    name: str
    role: str
    discord_id: Optional[str] = None
    discord_username: Optional[str] = None

    class Config:
        from_attributes = True

class CreateUserRequest(BaseModel):
    name: str
    role: Optional[Role] = Role.USER
    discord_id: Optional[str] = None
    discord_username: Optional[str] = None

router = APIRouter()

@router.post("/users", response_model=UserResponse)
async def register_user(
    request: CreateUserRequest,
    db_services = Depends(get_db_services)
):
    """Register a new user"""
    # Check if user with same Discord ID already exists
    if request.discord_id:
        existing_user = await db_services.users.by_discord(request.discord_id)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"User with Discord ID {request.discord_id} already exists"
            )
    
    # Create the user
    user = await db_services.users.create_user(
        name=request.name,
        role=request.role,
        discord_id=request.discord_id,
        discord_username=request.discord_username
    )
    
    return UserResponse(
        name=user.name,
        role=user.role.value,
        discord_id=user.discord_id,
        discord_username=user.discord_username
    )

@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db_services = Depends(get_db_services)
):
    """Get a user by their ID"""
    user = await db_services.users.by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse(
        name=user.name,
        role=user.role.value,
        discord_id=user.discord_id,
        discord_username=user.discord_username
    )

@router.get("/users", response_model=list[UserResponse])
async def get_all_users(
    db_services = Depends(get_db_services)
):
    """Get all users"""
    users = await db_services.users.all()
    return [
        UserResponse(
            name=user.name,
            role=user.role.value,
            discord_id=user.discord_id,
            discord_username=user.discord_username
        )
        for user in users
    ]
