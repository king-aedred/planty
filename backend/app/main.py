from fastapi import FastAPI
from fastapi.responses import PlainTextResponse

from app.routers.readings import router as readings_router

app = FastAPI(title="Planty Backend")

app.include_router(readings_router)


@app.get("/", response_class=PlainTextResponse)
async def root():
	return "Planty Backend running"
