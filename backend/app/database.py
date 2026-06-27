import logging
import os
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

CONVEX_HTTP_URL = os.getenv("CONVEX_HTTP_URL")
CONVEX_READINGS_PATH = os.getenv("CONVEX_READINGS_PATH", "/readings")


def _build_readings_url() -> str:
	if not CONVEX_HTTP_URL:
		raise RuntimeError("CONVEX_HTTP_URL is not configured")
	return f"{CONVEX_HTTP_URL.rstrip('/')}{CONVEX_READINGS_PATH}"


async def insert_reading(data: dict[str, Any]) -> Any:
	url = _build_readings_url()

	try:
		async with httpx.AsyncClient(timeout=10.0) as client:
			response = await client.post(url, json=data)
			response.raise_for_status()
			return response.json()
	except httpx.HTTPError:
		logger.exception("Failed to insert reading into Convex")
		raise


async def get_readings() -> Any:
	url = _build_readings_url()

	try:
		async with httpx.AsyncClient(timeout=10.0) as client:
			response = await client.get(url)
			response.raise_for_status()
			return response.json()
	except httpx.HTTPError:
		logger.exception("Failed to fetch readings from Convex")
		raise
