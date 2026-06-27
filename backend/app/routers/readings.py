from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.database import get_readings, insert_reading

router = APIRouter(prefix="/readings", tags=["readings"])


class ReadingCreate(BaseModel):
	sensor_id: str = Field(..., min_length=1)
	moisture: int
	timestamp: datetime


@router.post("")
async def create_reading(reading: ReadingCreate):
	try:
		payload = reading.model_dump(mode="json")
		return await insert_reading(payload)
	except Exception as exc:
		raise HTTPException(status_code=502, detail="Failed to write reading to Convex") from exc


@router.get("")
async def list_readings():
	try:
		return await get_readings()
	except Exception as exc:
		raise HTTPException(status_code=502, detail="Failed to fetch readings from Convex") from exc
