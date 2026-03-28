from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import uvicorn

from app_logger import get_logger

logger = get_logger("ml-service")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Loading SentenceTransformer model: all-MiniLM-L6-v2")
    app.state.embedder = SentenceTransformer("all-MiniLM-L6-v2")
    logger.info("ML models loaded successfully")
    yield
    logger.info("Shutting down ML service")


app = FastAPI(lifespan=lifespan)


class TextRequest(BaseModel):
    text: str

@app.post("/embed")
async def get_embed(payload: TextRequest, request: Request):
    logger.debug(f"Embedding request received: {payload.text[:100]}")
    embedder = request.app.state.embedder

    try:
        embedding_vector = embedder.encode(payload.text)
        embedding_list = [float(val) for val in embedding_vector.tolist()]
        logger.info(f"Embedding generated successfully (dim: {len(embedding_list)})")
        return {"embedding": embedding_list}
    except Exception as exc:
        logger.error(f"Embedding generation failed: {str(exc)}")
        raise HTTPException(status_code=500, detail=f"Embedding generation failed: {str(exc)}")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    logger.info(f"Starting ML service on port {port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
