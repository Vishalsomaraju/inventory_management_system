from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.config.database import get_db_connection
from app.services.ai_services import run_ai_agent, generate_proactive_insights, client, GROQ_MODEL
import json
from decimal import Decimal

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

class AISearchRequest(BaseModel):
    query: str

class SuggestedPOItem(BaseModel):
    product_id: int
    product_name: str
    suggested_quantity: int
    unit_price_estimate: float
    reason: str

class SuggestedPORequest(BaseModel):
    vendor_id: int
    vendor_name: str
    items: list[SuggestedPOItem]

class CreateSuggestedOrdersRequest(BaseModel):
    suggestions: list[SuggestedPORequest]

@router.post("/search")
def ai_search(request: AISearchRequest, conn=Depends(get_db_connection)):
    query = request.query
    with conn.cursor() as cursor:
        cursor.execute("SELECT id, name, sku, category, current_stock, reorder_level FROM products")
        products = [{"id": r[0], "name": r[1], "sku": r[2], "category": r[3], "current_stock": r[4], "reorder_level": r[5]} for r in cursor.fetchall()]

    prompt = f"""You are an AI search assistant. The user wants to search for: "{query}"

Given these products:
{json.dumps(products)}

Find the most relevant product IDs that match the user's search.
Return JSON ONLY in this format: {{"product_ids": [1, 2], "explanation": "Brief reason why these match"}}
"""
    try:
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.1
        )
        data = json.loads(response.choices[0].message.content)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/suggest-reorder")
def suggest_reorder(conn=Depends(get_db_connection)):
    with conn.cursor() as cursor:
        cursor.execute(
            '''
            SELECT
                p.id, p.name, p.sku, p.category, p.unit, p.current_stock, p.reorder_level, p.reorder_quantity, p.vendor_id,
                v.name AS vendor_name, v.contact_person, v.email AS vendor_email, v.phone AS vendor_phone,
                COALESCE((
                    SELECT SUM(st.quantity)
                    FROM stock_transactions st
                    WHERE st.product_id = p.id AND st.type = 'OUT' AND st.date >= NOW() - INTERVAL '30 days'
                ), 0) AS total_out_last_30_days
            FROM products p
            LEFT JOIN vendors v ON v.id = p.vendor_id
            WHERE p.current_stock <= p.reorder_level AND p.vendor_id IS NOT NULL
            ORDER BY v.name ASC, p.name ASC
            '''
        )
        products = [
            {
                **dict(zip([d[0] for d in cursor.description], row)),
                "high_consumption": row[-1] > 0 and row[-1] >= max(row[7] or 0, row[6] or 0),
            }
            for row in cursor.fetchall()
        ]
        
    if not products:
        return {"purchase_orders": []}
        
    prompt = f"""Given these low-stock products and recent consumption data, suggest purchase orders. Group by vendor. For each item, suggest an order quantity (use reorder_quantity as baseline, increase by 20% if consumption was high in last 30 days).

Return JSON ONLY (no markdown): {{"purchase_orders": [{{"vendor_id": 1, "vendor_name": "Vendor A", "items": [{{"product_id": 1, "product_name": "Product A", "suggested_quantity": 10, "unit_price_estimate": 10.0, "reason": "Reason for reorder"}}]}}]}}

Products: {json.dumps(products, default=str)}
"""
    try:
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.1
        )
        data = json.loads(response.choices[0].message.content)
        return {"purchase_orders": data.get("purchase_orders", [])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/create-suggested-orders")
def create_suggested_orders(payload: CreateSuggestedOrdersRequest, conn=Depends(get_db_connection)):
    created = []
    try:
        for suggestion in payload.suggestions:
            if not suggestion.items: continue
            
            with conn.cursor() as cursor:
                total_amount = sum((item.suggested_quantity * max(Decimal("0.01"), Decimal(str(item.unit_price_estimate)))) for item in suggestion.items if item.suggested_quantity > 0)
                if total_amount == 0: continue
                
                cursor.execute(
                    '''
                    INSERT INTO purchase_orders (vendor_id, status, total_amount)
                    VALUES (%s, 'draft', %s)
                    RETURNING id
                    ''',
                    (suggestion.vendor_id, total_amount),
                )
                po_id = cursor.fetchone()[0]
                
                for item in suggestion.items:
                    if item.suggested_quantity > 0:
                        cursor.execute(
                            '''
                            INSERT INTO po_line_items (po_id, product_id, quantity, unit_price)
                            VALUES (%s, %s, %s, %s)
                            ''',
                            (
                                po_id, 
                                item.product_id, 
                                item.suggested_quantity, 
                                max(Decimal("0.01"), Decimal(str(item.unit_price_estimate)))
                            )
                        )
                conn.commit()
                
                created.append({
                    "id": po_id,
                    "status": "draft",
                    "vendor_id": suggestion.vendor_id,
                    "vendor_name": suggestion.vendor_name,
                    "total_amount": float(total_amount),
                    "item_count": len([i for i in suggestion.items if i.suggested_quantity > 0])
                })
        return {"created_purchase_orders": created}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))