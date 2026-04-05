from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.config.database import get_db_connection
from services.ai_services import run_ai_agent, generate_proactive_insights

router = APIRouter()


class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[list[ChatMessage]] = []


@router.post("/chat")
def chat(request: ChatRequest, conn=Depends(get_db_connection)):
    """
    Main AI chat endpoint.
    Accepts a user message and prior conversation history.
    Runs the agentic tool-use loop and returns the assistant's response.
    """
    try:
        # Rebuild message list from client history
        messages = [{"role": m.role, "content": m.content} for m in request.history]
        messages.append({"role": "user", "content": request.message})

        result = run_ai_agent(messages, conn)
        return {"success": True, "data": result}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/insights")
def get_insights(conn=Depends(get_db_connection)):
    """
    Proactive insight signals for the AI assistant dashboard banner.
    Returns actionable alerts (low stock, draft POs, etc.) with suggested prompts.
    """
    try:
        insights = generate_proactive_insights(conn)
        return {"success": True, "data": insights}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))