import os
import json
from typing import Any
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Groq model that supports tool use
GROQ_MODEL = "llama-3.3-70b-versatile"

SYSTEM_PROMPT = """You are an intelligent inventory management assistant for a Smart Inventory & Procurement System.

You have access to live database tools to query real-time inventory data, vendors, purchase orders, and stock movements.
ALWAYS call the relevant tool(s) before answering any question about inventory — never guess or make up data.

Your responsibilities:
- Answer questions about stock levels, categories, and inventory health
- Identify low-stock or out-of-stock products and suggest reorder actions
- Analyse vendor relationships, spending patterns, and payment terms
- Review purchase order status and flag anything actionable
- Spot anomalies in stock transaction patterns
- Draft purchase orders ONLY after the user explicitly confirms they want one created

Tone: concise, data-driven, proactive. If you notice a critical issue (e.g. zero stock) while answering something else, mention it briefly.
Format responses with clear structure — use line breaks and bullet points where they help readability.
When presenting product tables, include SKU, stock, and reorder level.
"""

# Groq uses OpenAI-compatible tool format
INVENTORY_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_inventory_summary",
            "description": "Get all products with current stock levels, reorder levels, and vendor info. Use this for broad inventory questions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "description": "Optional: filter by category name (e.g. 'Electronics')"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_low_stock_products",
            "description": "Get products where current_stock <= reorder_level. Use for reorder alerts and restocking decisions.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_vendors",
            "description": "Get all vendors with contact info, payment terms, and how many products they supply.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_purchase_orders",
            "description": "Get purchase orders. Optionally filter by status: 'draft', 'sent', or 'received'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["draft", "sent", "received"],
                        "description": "Filter by PO status"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": "Search products by name, SKU, or category. Use for specific product lookups.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search term matched against product name, SKU, or category"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_stock_transactions",
            "description": "Get recent IN/OUT stock movements. Use to analyse consumption rates or audit stock changes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {
                        "type": "integer",
                        "description": "Optional: filter to a specific product ID"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max records to return (default 20, max 100)"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_purchase_order_draft",
            "description": "Create a draft PO in the database. Only call this AFTER the user explicitly says they want to create the order.",
            "parameters": {
                "type": "object",
                "properties": {
                    "vendor_id": {"type": "integer", "description": "ID of the vendor to order from"},
                    "product_id": {"type": "integer", "description": "ID of the product to reorder"},
                    "quantity": {"type": "integer", "description": "Quantity to order"},
                    "unit_price": {"type": "number", "description": "Unit price for this order"}
                },
                "required": ["vendor_id", "product_id", "quantity", "unit_price"]
            }
        }
    }
]


def _serialize_row(row: dict) -> dict:
    """Convert datetime/date objects to ISO strings for JSON serialisation."""
    return {k: v.isoformat() if hasattr(v, "isoformat") else v for k, v in row.items()}


def execute_tool(tool_name: str, tool_input: dict, conn) -> Any:
    """Execute a named tool against the live PostgreSQL database."""
    cursor = conn.cursor()
    try:
        if tool_name == "get_inventory_summary":
            query = """
                SELECT p.id, p.name, p.sku, p.category, p.unit,
                       p.current_stock, p.reorder_level, p.reorder_quantity,
                       v.name AS vendor_name, v.id AS vendor_id
                FROM products p
                LEFT JOIN vendors v ON p.vendor_id = v.id
            """
            params = []
            if tool_input.get("category"):
                query += " WHERE p.category = %s"
                params.append(tool_input["category"])
            query += " ORDER BY p.current_stock ASC"
            cursor.execute(query, params)
            cols = [d[0] for d in cursor.description]
            return [_serialize_row(dict(zip(cols, r))) for r in cursor.fetchall()]

        elif tool_name == "get_low_stock_products":
            cursor.execute("""
                SELECT p.id, p.name, p.sku, p.category,
                       p.current_stock, p.reorder_level, p.reorder_quantity,
                       v.name AS vendor_name, v.id AS vendor_id
                FROM products p
                LEFT JOIN vendors v ON p.vendor_id = v.id
                WHERE p.current_stock <= p.reorder_level
                ORDER BY (p.current_stock - p.reorder_level) ASC
            """)
            cols = [d[0] for d in cursor.description]
            return [_serialize_row(dict(zip(cols, r))) for r in cursor.fetchall()]

        elif tool_name == "get_vendors":
            cursor.execute("""
                SELECT v.id, v.name, v.contact_person, v.phone, v.email,
                       v.payment_terms, v.created_at,
                       COUNT(p.id) AS product_count
                FROM vendors v
                LEFT JOIN products p ON p.vendor_id = v.id
                GROUP BY v.id
                ORDER BY v.name
            """)
            cols = [d[0] for d in cursor.description]
            return [_serialize_row(dict(zip(cols, r))) for r in cursor.fetchall()]

        elif tool_name == "get_purchase_orders":
            query = """
                SELECT po.id, po.status, po.created_date, po.expected_delivery,
                       po.total_amount, v.name AS vendor_name,
                       COUNT(li.id) AS line_item_count
                FROM purchase_orders po
                LEFT JOIN vendors v ON po.vendor_id = v.id
                LEFT JOIN po_line_items li ON li.po_id = po.id
            """
            params = []
            if tool_input.get("status"):
                query += " WHERE po.status = %s"
                params.append(tool_input["status"])
            query += " GROUP BY po.id, v.name ORDER BY po.created_date DESC LIMIT 50"
            cursor.execute(query, params)
            cols = [d[0] for d in cursor.description]
            return [_serialize_row(dict(zip(cols, r))) for r in cursor.fetchall()]

        elif tool_name == "search_products":
            q = f"%{tool_input['query']}%"
            cursor.execute("""
                SELECT p.id, p.name, p.sku, p.category, p.unit,
                       p.current_stock, p.reorder_level, v.name AS vendor_name
                FROM products p
                LEFT JOIN vendors v ON p.vendor_id = v.id
                WHERE p.name ILIKE %s OR p.sku ILIKE %s OR p.category ILIKE %s
                ORDER BY p.name
            """, [q, q, q])
            cols = [d[0] for d in cursor.description]
            return [_serialize_row(dict(zip(cols, r))) for r in cursor.fetchall()]

        elif tool_name == "get_stock_transactions":
            limit = min(tool_input.get("limit", 20), 100)
            query = """
                SELECT st.id, st.type, st.quantity, st.date, st.notes,
                       p.name AS product_name, p.sku, p.id AS product_id
                FROM stock_transactions st
                JOIN products p ON st.product_id = p.id
            """
            params = []
            if tool_input.get("product_id"):
                query += " WHERE st.product_id = %s"
                params.append(tool_input["product_id"])
            query += " ORDER BY st.date DESC LIMIT %s"
            params.append(limit)
            cursor.execute(query, params)
            cols = [d[0] for d in cursor.description]
            return [_serialize_row(dict(zip(cols, r))) for r in cursor.fetchall()]

        elif tool_name == "create_purchase_order_draft":
            vendor_id = tool_input["vendor_id"]
            product_id = tool_input["product_id"]
            quantity = tool_input["quantity"]
            unit_price = tool_input["unit_price"]
            total = round(quantity * unit_price, 2)

            cursor.execute("""
                INSERT INTO purchase_orders (vendor_id, status, total_amount)
                VALUES (%s, 'draft', %s)
                RETURNING id
            """, [vendor_id, total])
            po_id = cursor.fetchone()[0]

            cursor.execute("""
                INSERT INTO po_line_items (po_id, product_id, quantity, unit_price)
                VALUES (%s, %s, %s, %s)
            """, [po_id, product_id, quantity, unit_price])

            conn.commit()
            return {
                "success": True,
                "po_id": po_id,
                "total_amount": total,
                "status": "draft",
                "message": f"Draft PO #{po_id} created successfully for ${total:,.2f}"
            }

        else:
            return {"error": f"Unknown tool: {tool_name}"}

    except Exception as e:
        conn.rollback()
        return {"error": str(e)}
    finally:
        cursor.close()


def run_ai_agent(messages: list, conn) -> dict:
    """
    Agentic loop using Groq's OpenAI-compatible API with tool use.
    Sends messages → executes tool calls → repeats until a final text response.
    """
    actions_taken = []

    # Convert to Groq/OpenAI message format (plain dicts with role/content strings)
    groq_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in messages:
        # Only include simple string-content messages from history
        if isinstance(m.get("content"), str):
            groq_messages.append({"role": m["role"], "content": m["content"]})

    # Safety cap — prevent infinite tool loops
    for _ in range(10):
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=groq_messages,
            tools=INVENTORY_TOOLS,
            tool_choice="auto",
            max_tokens=2048,
        )

        choice = response.choices[0]
        msg = choice.message

        # No tool calls — final answer
        if not msg.tool_calls:
            return {"response": msg.content or "", "actions_taken": actions_taken}

        # Append the assistant message (with tool_calls) to history
        groq_messages.append({
            "role": "assistant",
            "content": msg.content or "",
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    }
                }
                for tc in msg.tool_calls
            ]
        })

        # Execute each tool call and append results
        for tc in msg.tool_calls:
            tool_name = tc.function.name
            try:
                tool_input = json.loads(tc.function.arguments)
            except (json.JSONDecodeError, TypeError):
                tool_input = {}

            label = tool_name.replace("_", " ").title()
            actions_taken.append(label)

            result = execute_tool(tool_name, tool_input, conn)

            groq_messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result, default=str),
            })

    return {
        "response": "I ran into an issue completing your request. Please try again.",
        "actions_taken": actions_taken
    }


def generate_proactive_insights(conn) -> list:
    """
    Query the database for actionable inventory signals.
    Returns a list of insight objects for the dashboard banner (no AI call needed).
    """
    cursor = conn.cursor()
    insights = []
    try:
        cursor.execute("SELECT COUNT(*) FROM products WHERE current_stock = 0")
        zero_stock = cursor.fetchone()[0]
        if zero_stock:
            insights.append({
                "type": "critical",
                "icon": "alert",
                "title": f"{zero_stock} product{'s' if zero_stock != 1 else ''} completely out of stock",
                "prompt": "Which products are out of stock?"
            })

        cursor.execute("SELECT COUNT(*) FROM products WHERE current_stock <= reorder_level AND current_stock > 0")
        low_stock = cursor.fetchone()[0]
        if low_stock:
            insights.append({
                "type": "warning",
                "icon": "package",
                "title": f"{low_stock} product{'s' if low_stock != 1 else ''} below reorder level",
                "prompt": "Show me all low stock products and suggest reorder quantities."
            })

        cursor.execute("SELECT COUNT(*) FROM purchase_orders WHERE status = 'draft'")
        drafts = cursor.fetchone()[0]
        if drafts:
            insights.append({
                "type": "info",
                "icon": "clipboard",
                "title": f"{drafts} draft PO{'s' if drafts != 1 else ''} awaiting review",
                "prompt": "Show me all draft purchase orders."
            })

        cursor.execute("SELECT COUNT(*) FROM purchase_orders WHERE status = 'sent'")
        sent = cursor.fetchone()[0]
        if sent:
            insights.append({
                "type": "info",
                "icon": "truck",
                "title": f"{sent} order{'s' if sent != 1 else ''} sent and awaiting delivery",
                "prompt": "What purchase orders have been sent and are awaiting delivery?"
            })

    finally:
        cursor.close()

    return insights