from fastapi import APIRouter, Depends, HTTPException, status

from app.config.database import get_db_connection
from app.routers.auth import get_current_user


router = APIRouter(dependencies=[Depends(get_current_user)])


def rows_to_dicts(cursor, rows):
    columns = [description[0] for description in cursor.description]
    return [dict(zip(columns, row)) for row in rows]


@router.get("/dashboard")
def get_dashboard(conn=Depends(get_db_connection)):
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM products")
            total_products = cursor.fetchone()[0]

            cursor.execute(
                """
                SELECT COUNT(*)
                FROM products
                WHERE current_stock <= reorder_level
                """
            )
            low_stock_count = cursor.fetchone()[0]

            cursor.execute(
                """
                SELECT COUNT(*)
                FROM alerts
                WHERE is_resolved = FALSE
                """
            )
            active_alerts = cursor.fetchone()[0]

            cursor.execute(
                """
                SELECT COUNT(*)
                FROM purchase_orders
                WHERE status != 'received'
                """
            )
            pending_orders = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM vendors")
            total_vendors = cursor.fetchone()[0]

        return {
            "total_products": total_products,
            "low_stock_count": low_stock_count,
            "active_alerts": active_alerts,
            "pending_orders": pending_orders,
            "total_vendors": total_vendors,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch dashboard analytics: {exc}",
        ) from exc


@router.get("/stock-movements")
def get_stock_movements(conn=Depends(get_db_connection)):
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    TO_CHAR(DATE(st.date), 'YYYY-MM-DD') AS date,
                    COALESCE(SUM(CASE WHEN st.type = 'IN' THEN st.quantity ELSE 0 END), 0) AS in_quantity,
                    COALESCE(SUM(CASE WHEN st.type = 'OUT' THEN st.quantity ELSE 0 END), 0) AS out_quantity
                FROM stock_transactions st
                JOIN products p ON p.id = st.product_id
                WHERE st.date >= NOW() - INTERVAL '30 days'
                GROUP BY DATE(st.date)
                ORDER BY DATE(st.date) ASC
                """
            )
            return rows_to_dicts(cursor, cursor.fetchall())
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch stock movements: {exc}",
        ) from exc


@router.get("/top-products")
def get_top_products(conn=Depends(get_db_connection)):
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    st.product_id,
                    p.name AS product_name,
                    p.sku,
                    COALESCE(SUM(st.quantity), 0) AS total_out
                FROM stock_transactions st
                JOIN products p ON p.id = st.product_id
                WHERE st.type = 'OUT'
                  AND st.date >= NOW() - INTERVAL '90 days'
                GROUP BY st.product_id, p.name, p.sku
                ORDER BY total_out DESC, p.name ASC
                LIMIT 10
                """
            )
            return rows_to_dicts(cursor, cursor.fetchall())
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch top products: {exc}",
        ) from exc

def build_ai_context(conn):
    """
    Build context data for AI (chatbot / insights)
    """
    try:
        with conn.cursor() as cursor:
            # Basic stats
            cursor.execute("SELECT COUNT(*) FROM products")
            total_products = cursor.fetchone()[0]

            cursor.execute("""
                SELECT COUNT(*)
                FROM products
                WHERE current_stock <= reorder_level
            """)
            low_stock = cursor.fetchone()[0]

            cursor.execute("""
                SELECT p.name, SUM(st.quantity) as total_out
                FROM stock_transactions st
                JOIN products p ON p.id = st.product_id
                WHERE st.type = 'OUT'
                GROUP BY p.name
                ORDER BY total_out DESC
                LIMIT 5
            """)
            top_products = rows_to_dicts(cursor, cursor.fetchall())

        return {
            "total_products": total_products,
            "low_stock_products": low_stock,
            "top_products": top_products
        }

    except Exception as e:
        return {"error": str(e)}

def create_draft_purchase_order(conn, vendor_id, items):
    """
    Creates a draft purchase order (not yet finalized)
    """
    try:
        with conn.cursor() as cursor:
            # Create PO
            cursor.execute(
                """
                INSERT INTO purchase_orders (vendor_id, status)
                VALUES (%s, 'draft')
                RETURNING id
                """,
                (vendor_id,)
            )
            po_id = cursor.fetchone()[0]

            # Insert items
            for item in items:
                cursor.execute(
                    """
                    INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity)
                    VALUES (%s, %s, %s)
                    """,
                    (po_id, item["product_id"], item["quantity"])
                )

        conn.commit()

        return {"purchase_order_id": po_id, "status": "draft"}

    except Exception as e:
        conn.rollback()
        raise e


import calendar
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from fastapi import Query

from app.routers.auth import require_roles


TWOPLACES = Decimal("0.01")


def round_money(value):
    decimal_value = value if isinstance(value, Decimal) else Decimal(str(value or 0))
    return float(decimal_value.quantize(TWOPLACES, rounding=ROUND_HALF_UP))


def round_margin(value):
    if value is None:
        return None
    decimal_value = value if isinstance(value, Decimal) else Decimal(str(value))
    return float(decimal_value.quantize(TWOPLACES, rounding=ROUND_HALF_UP))


@router.get("/pnl")
def get_profit_and_loss(
    year: int = Query(default=datetime.now().year),
    conn=Depends(get_db_connection),
    current_user=Depends(require_roles("admin", "manager")),
):
    del current_user

    try:
        monthly_map = {
            month: {
                "month": month,
                "month_name": calendar.month_name[month],
                "revenue": Decimal("0"),
                "cost": Decimal("0"),
            }
            for month in range(1, 13)
        }

        with conn.cursor() as cursor:
            # Revenue by month from outbound stock transactions using the product selling price.
            cursor.execute(
                """
                SELECT
                    EXTRACT(MONTH FROM st.date)::INT AS month,
                    COALESCE(SUM(st.quantity * COALESCE(p.price_per_unit, 0)), 0) AS revenue
                FROM stock_transactions st
                JOIN products p ON p.id = st.product_id
                WHERE st.type = 'OUT'
                  AND EXTRACT(YEAR FROM st.date) = %s
                GROUP BY EXTRACT(MONTH FROM st.date)
                ORDER BY month ASC
                """,
                (year,),
            )
            for month, revenue in cursor.fetchall():
                monthly_map[month]["revenue"] = revenue or Decimal("0")

            # Cost by month from received purchase orders using the actual PO line item unit price.
            cursor.execute(
                """
                SELECT
                    EXTRACT(MONTH FROM po.received_date)::INT AS month,
                    COALESCE(SUM(li.quantity * li.unit_price), 0) AS cost
                FROM po_line_items li
                JOIN purchase_orders po ON po.id = li.po_id
                WHERE po.status = 'received'
                  AND po.received_date IS NOT NULL
                  AND EXTRACT(YEAR FROM po.received_date) = %s
                GROUP BY EXTRACT(MONTH FROM po.received_date)
                ORDER BY month ASC
                """,
                (year,),
            )
            for month, cost in cursor.fetchall():
                monthly_map[month]["cost"] = cost or Decimal("0")

        monthly = []
        for month in range(1, 13):
            revenue = monthly_map[month]["revenue"]
            cost = monthly_map[month]["cost"]
            gross_profit = revenue - cost
            margin_pct = None if revenue == 0 else (gross_profit / revenue) * Decimal("100")
            monthly.append(
                {
                    "month": month,
                    "month_name": monthly_map[month]["month_name"],
                    "revenue": round_money(revenue),
                    "cost": round_money(cost),
                    "gross_profit": round_money(gross_profit),
                    "margin_pct": round_margin(margin_pct),
                }
            )

        best_month_entry = max(monthly, key=lambda item: item["gross_profit"])
        worst_month_entry = min(monthly, key=lambda item: item["gross_profit"])
        total_revenue = sum((item["revenue"] for item in monthly), 0.0)
        total_cost = sum((item["cost"] for item in monthly), 0.0)
        total_profit = sum((item["gross_profit"] for item in monthly), 0.0)

        return {
            "year": year,
            "summary": {
                "total_revenue": round(total_revenue, 2),
                "total_cost": round(total_cost, 2),
                "total_profit": round(total_profit, 2),
                "best_month": {
                    "month": best_month_entry["month"],
                    "profit": round(best_month_entry["gross_profit"], 2),
                },
                "worst_month": {
                    "month": worst_month_entry["month"],
                    "profit": round(worst_month_entry["gross_profit"], 2),
                },
            },
            "monthly": monthly,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch P&L analytics: {exc}",
        ) from exc


@router.get("/pnl/categories")
def get_profit_and_loss_by_category(
    year: int = Query(...),
    month: int | None = Query(default=None, ge=1, le=12),
    conn=Depends(get_db_connection),
    current_user=Depends(require_roles("admin", "manager")),
):
    del current_user

    try:
        filters = ["EXTRACT(YEAR FROM st.date) = %s"]
        revenue_params = [year]
        cost_filters = ["EXTRACT(YEAR FROM po.received_date) = %s"]
        cost_params = [year]
        period = str(year)

        if month is not None:
            filters.append("EXTRACT(MONTH FROM st.date) = %s")
            revenue_params.append(month)
            cost_filters.append("EXTRACT(MONTH FROM po.received_date) = %s")
            cost_params.append(month)
            period = f"{year}-{month:02d}"

        category_map = {}

        with conn.cursor() as cursor:
            # Revenue by category from outbound stock transactions using the product selling price.
            cursor.execute(
                f"""
                SELECT
                    COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorized') AS category,
                    COALESCE(SUM(st.quantity * COALESCE(p.price_per_unit, 0)), 0) AS revenue
                FROM stock_transactions st
                JOIN products p ON p.id = st.product_id
                WHERE st.type = 'OUT'
                  AND {' AND '.join(filters)}
                GROUP BY COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorized')
                ORDER BY revenue DESC, category ASC
                """,
                tuple(revenue_params),
            )
            for category, revenue in cursor.fetchall():
                category_map[category] = {
                    "category": category,
                    "revenue": revenue or Decimal("0"),
                    "cost": Decimal("0"),
                }

            # Cost by category from received purchase orders using the actual PO line item unit price.
            cursor.execute(
                f"""
                SELECT
                    COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorized') AS category,
                    COALESCE(SUM(li.quantity * li.unit_price), 0) AS cost
                FROM po_line_items li
                JOIN purchase_orders po ON po.id = li.po_id
                JOIN products p ON p.id = li.product_id
                WHERE po.status = 'received'
                  AND po.received_date IS NOT NULL
                  AND {' AND '.join(cost_filters)}
                GROUP BY COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorized')
                ORDER BY cost DESC, category ASC
                """,
                tuple(cost_params),
            )
            for category, cost in cursor.fetchall():
                existing = category_map.setdefault(
                    category,
                    {
                        "category": category,
                        "revenue": Decimal("0"),
                        "cost": Decimal("0"),
                    },
                )
                existing["cost"] = cost or Decimal("0")

        categories = []
        for category_data in category_map.values():
            revenue = category_data["revenue"]
            cost = category_data["cost"]
            gross_profit = revenue - cost
            margin_pct = None if revenue == 0 else (gross_profit / revenue) * Decimal("100")
            categories.append(
                {
                    "category": category_data["category"],
                    "revenue": round_money(revenue),
                    "cost": round_money(cost),
                    "gross_profit": round_money(gross_profit),
                    "margin_pct": round_margin(margin_pct),
                }
            )

        categories.sort(key=lambda item: (-item["revenue"], item["category"]))

        return {
            "period": period,
            "categories": categories,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch P&L category analytics: {exc}",
        ) from exc
