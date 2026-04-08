import os
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List
from dotenv import load_dotenv

from app.config.database import get_db_connection
from app.routers.auth import get_current_user

load_dotenv(".env.local")
load_dotenv()

router = APIRouter(dependencies=[Depends(get_current_user)])

class Message(BaseModel):
    role: str
    content: str

class AIQuery(BaseModel):
    message: str
    conversation_history: List[Message] = []

def build_inventory_context(conn) -> str:
    try:
        with conn.cursor() as cursor:
            # Total products, out-of-stock, below-reorder
            cursor.execute("""
                SELECT COUNT(*) as total_products, 
                       SUM(CASE WHEN current_stock = 0 THEN 1 ELSE 0 END) as out_of_stock_count, 
                       SUM(CASE WHEN current_stock <= reorder_level THEN 1 ELSE 0 END) as below_reorder_count 
                FROM products
            """)
            stats_row = cursor.fetchone()
            total_products = stats_row[0] or 0
            out_of_stock = stats_row[1] or 0
            below_reorder = stats_row[2] or 0

            # Top 5 low stock products
            cursor.execute("""
                SELECT name, current_stock, reorder_level 
                FROM products 
                WHERE current_stock <= reorder_level 
                ORDER BY current_stock ASC 
                LIMIT 5
            """)
            low_stock_rows = cursor.fetchall()
            low_stock_list = [f"- {r[0]}: {r[1]} in stock (Reorder at {r[2]})" for r in low_stock_rows]

            # Top 5 dead stock
            cursor.execute("""
                SELECT p.name, p.current_stock, MAX(st.date) as last_out
                FROM products p
                LEFT JOIN stock_transactions st ON st.product_id = p.id AND st.type = 'OUT'
                WHERE p.current_stock > p.reorder_level * 2
                GROUP BY p.id
            """)
            dead_stock_candidates = []
            now_utc = datetime.now(timezone.utc)
            for row in cursor.fetchall():
                name = row[0]
                stock = row[1]
                last_out = row[2]
                days = None
                if last_out:
                    try:
                        diff = now_utc - last_out
                    except TypeError:
                        diff = now_utc.replace(tzinfo=None) - last_out.replace(tzinfo=None)
                    days = diff.days
                if days is None or days >= 30:
                    dead_stock_candidates.append((name, stock, days))
            dead_stock_candidates.sort(key=lambda x: (x[2] if x[2] is not None else 9999), reverse=True)
            dead_stock_list = [f"- {r[0]}: {r[1]} in stock (Idle for {r[2] if r[2] else '∞'} days)" for r in dead_stock_candidates[:5]]

            # Last month's top 5 selling products
            cursor.execute("""
                SELECT p.name, SUM(st.quantity) as units_out
                FROM stock_transactions st
                JOIN products p ON st.product_id = p.id
                WHERE st.type = 'OUT' AND st.date >= NOW() - INTERVAL '30 days'
                GROUP BY p.id
                ORDER BY units_out DESC
                LIMIT 5
            """)
            top_selling = [f"- {r[0]}: {r[1]} units sold" for r in cursor.fetchall()]

            # Pending purchase orders count + total value
            cursor.execute("""
                SELECT COUNT(DISTINCT po.id), COALESCE(SUM(li.quantity * li.unit_price), 0)
                FROM purchase_orders po
                LEFT JOIN po_line_items li ON li.po_id = po.id
                WHERE po.status != 'received'
            """)
            po_row = cursor.fetchone()
            pending_pos = po_row[0] or 0
            pending_value = po_row[1] or 0

            # Active unresolved alerts count
            cursor.execute("SELECT COUNT(*) FROM alerts WHERE is_resolved = false")
            active_alerts = cursor.fetchone()[0] or 0

            context = f"""--- INVENTORY SNAPSHOT ---
Total Products: {total_products}
Out of Stock: {out_of_stock}
Below Reorder Level: {below_reorder}
Pending Purchase Orders: {pending_pos} (Total Value: ₹{pending_value:,.2f})
Active Alerts: {active_alerts}

TOP 5 LOW STOCK PRODUCTS:
{chr(10).join(low_stock_list) if low_stock_list else 'None'}

TOP 5 DEAD STOCK PRODUCTS:
{chr(10).join(dead_stock_list) if dead_stock_list else 'None'}

LAST 30 DAYS TOP SELLING PRODUCTS:
{chr(10).join(top_selling) if top_selling else 'None'}
"""
            return context
    except Exception as e:
        print("Error building context:", e)
        return "Inventory Snapshot Unavailable."


@router.post("/query")
async def process_ai_query(query: AIQuery, conn=Depends(get_db_connection)):
    api_key = os.environ.get("OPENAI_API_KEY")
    api_base = "https://api.openai.com/v1/chat/completions"
    model_name = "gpt-4o-mini"
    
    if not api_key:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        api_key = os.environ.get("GROQ_API_KEY")
        if api_key:
            api_base = "https://api.groq.com/openai/v1/chat/completions"
            model_name = "llama3-8b-8192"
        
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI assistant not configured"
        )
    
    masked_key = f"{api_key[:4]}***" if len(api_key) > 4 else "***"
    print(f"Using AI API Key: {masked_key} hitting {api_base}")

    context_str = build_inventory_context(conn)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    system_prompt = f"""You are an expert inventory and procurement analyst for a business using the Smart Inventory & Procurement System.
You have access to the following live inventory snapshot as of {now_str}:

{context_str}

Answer the user's question based on this data. Be specific with numbers.
If asked for recommendations, be direct and actionable.
Keep responses concise — under 200 words unless detail is requested.
Format numbers with commas. Use ₹ for currency."""

    messages = [{"role": "system", "content": system_prompt}]
    for h in query.conversation_history:
        messages.append({"role": h.role, "content": h.content})
    messages.append({"role": "user", "content": query.message})

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                api_base,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": model_name,
                    "messages": messages,
                    "max_tokens": 400
                }
            )
            
            if response.status_code != 200:
                print("LLM API Error:", response.text)
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"OpenAI API error: {response.text}"
                )
                
            data = response.json()
            reply = data["choices"][0]["message"]["content"]
            
            return {
                "reply": reply,
                "context_snapshot_at": datetime.utcnow().isoformat()
            }
            
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error communicating with AI service: {str(e)}"
        )

@router.get("/suggested-questions")
def get_suggested_questions():
    return {
        "questions": [
            "Which products should I reorder this week?",
            "What's causing our lowest margin products?",
            "Which vendors have the best delivery performance?",
            "Show me products at risk of stockout next month",
            "What were our top selling categories last month?"
        ]
    }
