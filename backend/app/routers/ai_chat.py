import json
import os
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

import anthropic
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.config.database import get_db_connection
from app.middleware.auth import get_current_user
from app.routers.analytics import build_ai_context
from app.routers.purchase_orders import (
    POLineItemRequest,
    create_draft_purchase_order,
    require_roles,
)


router = APIRouter()


class ChatHistoryItem(BaseModel):
    role: str
    content: str


class AIChatRequest(BaseModel):
    message: str
    context: dict[str, Any]
    history: list[ChatHistoryItem] = Field(default_factory=list, max_length=10)


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


def get_anthropic_client() -> anthropic.Anthropic:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ANTHROPIC_API_KEY is not configured",
        )
    return anthropic.Anthropic(api_key=api_key)


@router.post("/chat")
def chat_with_ai(
    payload: AIChatRequest,
    current_user=Depends(get_current_user),
):
    del current_user

    context_json = json.dumps(payload.context, indent=2, default=str)
    system_prompt = f"""You are an intelligent inventory management assistant for a Smart Inventory & Procurement System. You help managers make better decisions about stock, procurement, and vendors.

You have access to a real-time inventory snapshot provided in the user's message context. Use it to give specific, data-driven answers.

Current inventory context:
{context_json}

Guidelines:
- Always reference specific products, quantities, and vendor names from the context
- For low stock items, suggest concrete reorder quantities based on reorder_level and reorder_quantity
- Be concise - 2-4 sentences unless detail is requested
- If asked about trends, note you only have recent data
- For purchase order recommendations, specify vendor, products, and suggested quantities
- Flag critical items (current_stock = 0) urgently"""

    client = get_anthropic_client()
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=system_prompt,
        messages=[
            *[
                {"role": item.role, "content": item.content}
                for item in payload.history[-10:]
            ],
            {"role": "user", "content": payload.message},
        ],
    )

    if not response.content:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Anthropic returned an empty response",
        )

    return {"response": response.content[0].text}


@router.get("/insights")
def get_ai_insights(
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    del current_user

    generated_at = datetime.now(timezone.utc).isoformat()
    context = build_ai_context(conn)
    prompt = """Analyze this inventory snapshot and return a JSON array of insights. Each insight has:
{ type: 'warning'|'suggestion'|'info', title: string (max 8 words), message: string (max 30 words), action_label: string (optional, max 4 words), action_route: string (optional, e.g. '/inventory', '/purchase-orders') }

Focus on: critical stockouts, items approaching reorder level, vendors with many pending POs, unusual patterns. Return 3-5 insights. Return ONLY valid JSON array, no markdown."""

    client = get_anthropic_client()
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": f"{prompt}\n\nInventory snapshot:\n{json.dumps(context, indent=2, default=str)}",
            }
        ],
    )

    response_text = response.content[0].text if response.content else ""

    try:
        insights = json.loads(response_text)
        if not isinstance(insights, list):
            raise ValueError("Claude response was not a JSON array")
        return {"insights": insights, "generated_at": generated_at}
    except (json.JSONDecodeError, ValueError):
        return {
            "insights": [],
            "generated_at": generated_at,
            "error": "parse_failed",
        }


@router.post("/suggest-reorder")
def suggest_reorder_purchase_orders(
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    del current_user

    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                p.id,
                p.name,
                p.sku,
                p.category,
                p.unit,
                p.current_stock,
                p.reorder_level,
                p.reorder_quantity,
                p.vendor_id,
                v.name AS vendor_name,
                v.contact_person,
                v.email AS vendor_email,
                v.phone AS vendor_phone,
                COALESCE((
                    SELECT SUM(st.quantity)
                    FROM stock_transactions st
                    WHERE st.product_id = p.id
                      AND st.type = 'OUT'
                      AND st.date >= NOW() - INTERVAL '30 days'
                ), 0) AS total_out_last_30_days
            FROM products p
            LEFT JOIN vendors v ON v.id = p.vendor_id
            WHERE p.current_stock <= p.reorder_level
              AND p.vendor_id IS NOT NULL
            ORDER BY v.name ASC, p.name ASC
            """
        )
        products = [
            {
                **dict(zip([description[0] for description in cursor.description], row)),
                "high_consumption": row[-1] > 0 and row[-1] >= max(row[7], row[6]),
            }
            for row in cursor.fetchall()
        ]

    if not products:
        return {"purchase_orders": [], "generated_at": datetime.now(timezone.utc).isoformat()}

    prompt = f"""Given these low-stock products and their recent consumption data, suggest purchase orders. Group by vendor. For each item, suggest an order quantity (use reorder_quantity as baseline, increase by 20% if consumption was high in last 30 days).

Products data: {json.dumps(products, indent=2, default=str)}

Return JSON: {{ purchase_orders: [ {{ vendor_id, vendor_name, items: [ {{ product_id, product_name, suggested_quantity, unit_price_estimate, reason }} ] }} ] }}

Only include products that genuinely need reordering. Return ONLY valid JSON."""

    client = get_anthropic_client()
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
    )

    response_text = response.content[0].text if response.content else ""
    generated_at = datetime.now(timezone.utc).isoformat()

    try:
        parsed = json.loads(response_text)
        purchase_orders = parsed.get("purchase_orders", [])
        if not isinstance(purchase_orders, list):
            raise ValueError("purchase_orders must be a list")

        enriched_pos = []
        for po in purchase_orders:
            items = po.get("items", [])
            if not isinstance(items, list) or not items:
                continue

            estimated_total_spend = 0.0
            cleaned_items = []
            for item in items:
                quantity = int(item.get("suggested_quantity", 0) or 0)
                unit_price = float(item.get("unit_price_estimate", 0) or 0)
                if quantity <= 0 or unit_price <= 0:
                    continue
                estimated_total_spend += quantity * unit_price
                cleaned_items.append(
                    {
                        "product_id": item.get("product_id"),
                        "product_name": item.get("product_name"),
                        "suggested_quantity": quantity,
                        "unit_price_estimate": round(unit_price, 2),
                        "reason": item.get("reason", ""),
                    }
                )

            if cleaned_items:
                enriched_pos.append(
                    {
                        "vendor_id": po.get("vendor_id"),
                        "vendor_name": po.get("vendor_name"),
                        "items": cleaned_items,
                        "estimated_total_spend": round(estimated_total_spend, 2),
                    }
                )

        return {"purchase_orders": enriched_pos, "generated_at": generated_at}
    except (json.JSONDecodeError, ValueError, TypeError):
        return {
            "purchase_orders": [],
            "generated_at": generated_at,
            "error": "parse_failed",
        }


@router.post("/create-suggested-orders", status_code=status.HTTP_201_CREATED)
def create_suggested_orders(
    payload: CreateSuggestedOrdersRequest,
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    require_roles(current_user, {"admin", "manager"})

    created_orders = []
    for suggestion in payload.suggestions:
        line_items = []
        for item in suggestion.items:
            if item.suggested_quantity <= 0:
                continue
            try:
                unit_price = Decimal(str(item.unit_price_estimate))
            except (InvalidOperation, ValueError):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid unit price estimate for product {item.product_id}",
                )
            if unit_price <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unit price estimate must be positive for product {item.product_id}",
                )
            line_items.append(
                POLineItemRequest(
                    product_id=item.product_id,
                    quantity=item.suggested_quantity,
                    unit_price=unit_price,
                )
            )

        if not line_items:
            continue

        created_po = create_draft_purchase_order(
            conn=conn,
            vendor_id=suggestion.vendor_id,
            line_items=line_items,
        )
        created_orders.append(
            {
                "id": created_po["id"],
                "vendor_id": created_po["vendor_id"],
                "vendor_name": created_po["vendor"]["name"] if created_po.get("vendor") else suggestion.vendor_name,
                "total_amount": float(created_po["total_amount"] or 0),
            }
        )

    return {"created_purchase_orders": created_orders}


@router.post("/search")
def ai_search_inventory(
    payload: AISearchRequest,
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    del current_user

    query = payload.query.strip()
    if not query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query is required",
        )

    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                p.id,
                p.name,
                p.sku,
                p.category,
                p.current_stock,
                p.reorder_level,
                v.name AS vendor_name
            FROM products p
            LEFT JOIN vendors v ON v.id = p.vendor_id
            ORDER BY p.name ASC
            """
        )
        products = [
            dict(zip([description[0] for description in cursor.description], row))
            for row in cursor.fetchall()
        ]

    prompt = f"""The user is searching their inventory with this natural language query: '{query}'

Available products (as JSON): {json.dumps(products, indent=2, default=str)}

Return a JSON object: {{ product_ids: [list of matching product IDs], explanation: string (1 sentence explaining the match logic) }}

Examples: 'show me everything low on stock' filter where current_stock <= reorder_level. 'electronics from Tech Supplies' filter by category and vendor. 'items I need to reorder' filter low stock. Return ONLY valid JSON."""

    client = get_anthropic_client()
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
    )

    response_text = response.content[0].text if response.content else ""

    try:
        parsed = json.loads(response_text)
        product_ids = parsed.get("product_ids", [])
        explanation = parsed.get("explanation", "")
        if not isinstance(product_ids, list):
            raise ValueError("product_ids must be a list")
        return {
            "product_ids": [int(product_id) for product_id in product_ids],
            "explanation": explanation if isinstance(explanation, str) else "",
        }
    except (json.JSONDecodeError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to parse AI search response",
        )
