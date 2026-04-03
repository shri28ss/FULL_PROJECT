from contextlib import asynccontextmanager
import os
import json
from typing import Optional, List

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import uvicorn
import google.generativeai as genai
from dotenv import load_dotenv

from app_logger import get_logger

load_dotenv()
logger = get_logger("ml-service")

# Configure Gemini
api_key = os.getenv("GEMINI_API_KEY")
model_name = os.getenv("CLASSIFIER_MODEL", "models/gemini-2.5-flash")

if api_key:
    genai.configure(api_key=api_key)
    logger.info(f"Gemini configured with model: {model_name}")
else:
    logger.warning("GEMINI_API_KEY not found in environment")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Loading SentenceTransformer model: all-MiniLM-L6-v2")
    try:
        app.state.embedder = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("ML models loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load sentence-transformer: {str(e)}")
    yield
    logger.info("Shutting down ML service")

app = FastAPI(lifespan=lifespan)

class TextRequest(BaseModel):
    text: str

class ChatIntentRequest(BaseModel):
    text: str
    user_id: str

class ChatSummarizeRequest(BaseModel):
    user_query: str
    context_data: str
    user_id: str

@app.post("/embed")
async def get_embed(payload: TextRequest, request: Request):
    logger.debug(f"Embedding request received: {payload.text[:100]}")
    embedder = request.app.state.embedder

    try:
        embedding_vector = embedder.encode(payload.text)
        embedding_list = [float(val) for val in embedding_vector.tolist()]
        return {"embedding": embedding_list}
    except Exception as exc:
        logger.error(f"Embedding generation failed: {str(exc)}")
        raise HTTPException(status_code=500, detail=f"Embedding generation failed: {str(exc)}")

@app.post("/chat/intent")
async def get_intent(payload: ChatIntentRequest):
    if not api_key:
        raise HTTPException(status_code=500, detail="Gemini API not configured")
    
    prompt = f"""
    You are a financial intent classifier for LedgerBuddy.
    Analyze the user's query and categorize it into one of these intents:
    - SPENDING_SUMMARY: Asking for general spending totals or breakdown.
    - ANOMALY_DETECTION: Asking about spikes, unusual transactions, or "money leaking".
    - COMPARISON: Comparing different months or timeframes.
    - BUDGET_ADVICE: Asking if it's safe to spend or budget tips.
    - UI_HELP: Questions about how to use the LedgerAI platform (uploading, QC, dashboard navigation).
    - GENERAL: Greeting, polite talk, or queries that don't fit above.

    User Query: "{payload.text}"

    Return ONLY a JSON object: 
    {{
        "intent": "INTENT_NAME",
        "params": {{ "timeframe": "relative_time", "category": "optional", "topic": "optional" }}
    }}
    """
    
    try:
        model = genai.GenerativeModel(model_name)
        response = model.generate_content(prompt)
        
        # Extract JSON from response
        raw_text = response.text.strip()
        if "```json" in raw_text:
            raw_text = raw_text.split("```json")[1].split("```")[0].strip()
        elif "```" in raw_text:
            raw_text = raw_text.split("```")[1].split("```")[0].strip()
            
        intent_data = json.loads(raw_text)
        return intent_data
    except Exception as e:
        logger.error(f"Intent classification failed: {str(e)}")
        return {"intent": "GENERAL", "params": {}}

@app.post("/chat/summarize")
async def summarize_context(payload: ChatSummarizeRequest):
    if not api_key:
        raise HTTPException(status_code=500, detail="Gemini API not configured")

    system_prompt = f"""
    You are LedgerBuddy, a friendly and professional AI financial assistant for the LedgerAI platform.
    
    PLATFORM CONTEXT:
    - LedgerAI is an automated categorization tool for bank statements.
    - Navigation: Overview (Dashboard), Transactions (List of entries), Accounts (COA Management), Parsing (PDF Upload), Review (Verification).
    - QC Panel: Advanced tools for QC users (COA Library, Keyword Rules, Vector Cache, Audit Queue).
    - Categorization: 5-stage pipeline including Contra Radar, Rules Engine, and AI Fallback.
    - Uploading: Users can upload PDFs/CSVs in the 'Parsing' section via the Sidebar.

    USER DATA CONTEXT (JSON): {payload.context_data}

    Rules:
    1. If the user asks a financial data question, use only the numbers in the JSON.
    2. If the user asks a "How to" or UI question, refer to the PLATFORM CONTEXT.
    3. If data is missing for a data question, say "I don't have that information yet."
    4. For any other arbitrary questions, be polite and helpful, leaning on your general knowledge but prioritizing the platform context.
    5. Summarize monthly history if provided to show trends.
    6. Do not give official financial advice.
    7. Responses must be concise and human-friendly.
    """
    
    try:
        model = genai.GenerativeModel(model_name)
        chat = model.start_chat()
        response = chat.send_message(f"Instruction: {system_prompt}\nUser Question: {payload.user_query}")
        
        return {"text": response.text}
    except Exception as e:
        logger.error(f"Narrative generation failed: {str(e)}")
        return {"text": "I'm experiencing a bit of a brain-freeze! Could you please ask that again?"}

@app.get("/health")
async def health():
    return {"status": "ok", "model": model_name}

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    logger.info(f"Starting ML service on port {port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
