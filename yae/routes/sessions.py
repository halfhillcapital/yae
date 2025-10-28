from fastapi import APIRouter, Depends, HTTPException

from yae.database.models import Session

router = APIRouter()