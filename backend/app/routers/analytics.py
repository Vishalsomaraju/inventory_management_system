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
        raise


# ── PHASE 8: Dashboard Summary ──
@router.get("/dashboard-summary")
def get_dashboard_summary(conn=Depends(get_db_connection)):
    try:
        with conn.cursor() as cursor:
            # Inventory metrics
            cursor.execute("""
                SELECT 
                  COUNT(*) as total_products,
                  COALESCE(SUM(current_stock * cost_per_unit), 0) as total_stock_value,
                  COUNT(CASE WHEN current_stock <= reorder_level THEN 1 END) as low_stock_count,
                  COUNT(CASE WHEN current_stock = 0 THEN 1 END) as out_of_stock_count,
                  COUNT(CASE WHEN current_stock > reorder_level * 2 AND NOT EXISTS (
                     SELECT 1 FROM stock_transactions st 
                     WHERE st.product_id = products.id AND st.type = 'OUT' AND st.date >= NOW() - INTERVAL '30 days'
                  ) THEN 1 END) as dead_stock_count
                FROM products;
            """)
            inv_row = cursor.fetchone()
            
            inventory_data = {
                "total_products": inv_row[0],
                "total_stock_value": float(inv_row[1]),
                "low_stock_count": inv_row[2],
                "out_of_stock_count": inv_row[3],
                "dead_stock_count": inv_row[4]
            }

            # Orders
            cursor.execute("""
                SELECT
                  COUNT(DISTINCT CASE WHEN po.status IN ('draft', 'sent') THEN po.id END) as pending_pos,
                  COALESCE(SUM(CASE WHEN po.status IN ('draft', 'sent') THEN li.quantity * li.unit_price ELSE 0 END), 0) as pending_po_value,
                  COUNT(DISTINCT CASE WHEN po.status = 'received' AND po.created_date >= date_trunc('month', NOW()) THEN po.id END) as received_this_month
                FROM purchase_orders po
                LEFT JOIN po_line_items li ON li.po_id = po.id;
            """)
            ord_row = cursor.fetchone()
            
            orders_data = {
                "pending_pos": ord_row[0],
                "pending_po_value": float(ord_row[1]),
                "received_this_month": ord_row[2]
            }

            # Alerts
            cursor.execute("""
                SELECT
                  COUNT(CASE WHEN is_resolved = false THEN 1 END) as active_alerts,
                  COUNT(CASE WHEN is_resolved = true AND DATE(resolved_at) = CURRENT_DATE THEN 1 END) as resolved_today
                FROM alerts;
            """)
            alt_row = cursor.fetchone()
            
            alerts_data = {
                "active_alerts": alt_row[0],
                "resolved_today": alt_row[1]
            }

            # Sales Today
            cursor.execute("""
                SELECT 
                  COALESCE(SUM(st.quantity), 0) as units_out,
                  COALESCE(SUM(st.quantity * p.cost_per_unit), 0) as revenue
                FROM stock_transactions st
                JOIN products p ON p.id = st.product_id
                WHERE st.type = 'OUT' AND DATE(st.date) = CURRENT_DATE;
            """)
            sales_row = cursor.fetchone()
            
            sales_today = {
                "units_out": sales_row[0],
                "revenue": float(sales_row[1])
            }

            # Top movers 7d
            cursor.execute("""
                SELECT p.id, p.name, SUM(st.quantity) as units_out
                FROM stock_transactions st
                JOIN products p ON p.id = st.product_id
                WHERE st.type = 'OUT' AND st.date >= NOW() - INTERVAL '7 days'
                GROUP BY p.id, p.name
                ORDER BY units_out DESC
                LIMIT 5;
            """)
            movers_rows = cursor.fetchall()
            top_movers_7d = [
                {"product_id": r[0], "name": r[1], "units_out": r[2]} 
                for r in movers_rows
            ]

            return {
                "inventory": inventory_data,
                "orders": orders_data,
                "alerts": alerts_data,
                "sales_today": sales_today,
                "top_movers_7d": top_movers_7d
            }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error fetching dashboard summary")


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


# PHASE 2: Sales Analysis
@router.get("/sales/monthly")
def get_monthly_sales_analysis(
    year: int = Query(default=datetime.now().year),
    month: int = Query(default=datetime.now().month, ge=1, le=12),
    conn=Depends(get_db_connection),
    current_user=Depends(require_roles("admin", "manager", "storekeeper")),
):
    del current_user

    try:
        with conn.cursor() as cursor:
            # Aggregate current-month and previous-month OUT movement per product, then derive trend and rank.
            cursor.execute(
                """
                WITH current_month_sales AS (
                    SELECT
                        p.id AS product_id,
                        p.name,
                        p.sku,
                        COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorized') AS category,
                        COALESCE(SUM(st.quantity), 0) AS units_sold,
                        COALESCE(SUM(st.quantity * COALESCE(p.price_per_unit, 0)), 0) AS revenue
                    FROM stock_transactions st
                    JOIN products p ON p.id = st.product_id
                    WHERE st.type = 'OUT'
                      AND EXTRACT(YEAR FROM st.date) = %s
                      AND EXTRACT(MONTH FROM st.date) = %s
                    GROUP BY p.id, p.name, p.sku, COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorized')
                ),
                previous_month_sales AS (
                    SELECT
                        st.product_id,
                        COALESCE(SUM(st.quantity), 0) AS units_sold
                    FROM stock_transactions st
                    WHERE st.type = 'OUT'
                      AND EXTRACT(YEAR FROM st.date) = %s
                      AND EXTRACT(MONTH FROM st.date) = %s
                    GROUP BY st.product_id
                )
                SELECT
                    ROW_NUMBER() OVER (ORDER BY cms.units_sold DESC, cms.revenue DESC, cms.name ASC) AS rank,
                    cms.product_id,
                    cms.name,
                    cms.sku,
                    cms.category,
                    cms.units_sold,
                    cms.revenue,
                    CASE
                        WHEN COALESCE(pms.units_sold, 0) = 0 AND cms.units_sold > 0 THEN 'up'
                        WHEN cms.units_sold > COALESCE(pms.units_sold, 0) * 1.1 THEN 'up'
                        WHEN cms.units_sold < COALESCE(pms.units_sold, 0) * 0.9 THEN 'down'
                        ELSE 'stable'
                    END AS trend
                FROM current_month_sales cms
                LEFT JOIN previous_month_sales pms ON pms.product_id = cms.product_id
                ORDER BY cms.units_sold DESC, cms.revenue DESC, cms.name ASC
                """,
                (
                    year,
                    month,
                    year - 1 if month == 1 else year,
                    12 if month == 1 else month - 1,
                ),
            )
            rows = cursor.fetchall()

        top_products = []
        total_units_moved = 0
        for rank, product_id, name, sku, category, units_sold, revenue, trend in rows:
            top_products.append(
                {
                    "rank": rank,
                    "product_id": product_id,
                    "name": name,
                    "sku": sku,
                    "category": category,
                    "units_sold": units_sold,
                    "revenue": round_money(revenue),
                    "trend": trend,
                }
            )
            total_units_moved += units_sold

        return {
            "period": f"{year}-{month:02d}",
            "total_products_sold": len(top_products),
            "total_units_moved": total_units_moved,
            "top_products": top_products,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch monthly sales analysis: {exc}",
        ) from exc


# PHASE 2: Sales Analysis
@router.get("/sales/trend")
def get_product_sales_trend(
    product_id: int = Query(...),
    months: int = Query(default=6, ge=1, le=12),
    conn=Depends(get_db_connection),
    current_user=Depends(require_roles("admin", "manager", "storekeeper")),
):
    del current_user

    try:
        with conn.cursor() as cursor:
            # Fetch the product label once, then return a zero-filled month series with OUT totals over the requested window.
            cursor.execute(
                """
                SELECT name
                FROM products
                WHERE id = %s
                """,
                (product_id,),
            )
            product_row = cursor.fetchone()
            product_name = product_row[0] if product_row else None

            cursor.execute(
                """
                WITH month_series AS (
                    SELECT
                        generate_series(
                            date_trunc('month', CURRENT_DATE) - ((%s - 1) * INTERVAL '1 month'),
                            date_trunc('month', CURRENT_DATE),
                            INTERVAL '1 month'
                        ) AS month_start
                ),
                monthly_sales AS (
                    SELECT
                        date_trunc('month', st.date) AS month_start,
                        COALESCE(SUM(st.quantity), 0) AS units_sold,
                        COALESCE(SUM(st.quantity * COALESCE(p.price_per_unit, 0)), 0) AS revenue
                    FROM stock_transactions st
                    JOIN products p ON p.id = st.product_id
                    WHERE st.type = 'OUT'
                      AND st.product_id = %s
                      AND st.date >= date_trunc('month', CURRENT_DATE) - ((%s - 1) * INTERVAL '1 month')
                      AND st.date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
                    GROUP BY date_trunc('month', st.date)
                )
                SELECT
                    EXTRACT(MONTH FROM ms.month_start)::INT AS month,
                    EXTRACT(YEAR FROM ms.month_start)::INT AS year,
                    TO_CHAR(ms.month_start, 'FMMonth') AS month_name,
                    COALESCE(s.units_sold, 0) AS units_sold,
                    COALESCE(s.revenue, 0) AS revenue
                FROM month_series ms
                LEFT JOIN monthly_sales s ON s.month_start = ms.month_start
                ORDER BY ms.month_start ASC
                """,
                (months, product_id, months),
            )
            rows = cursor.fetchall()

        trend_data = [
            {
                "month": month,
                "year": year,
                "month_name": month_name,
                "units_sold": units_sold,
                "revenue": round_money(revenue),
            }
            for month, year, month_name, units_sold, revenue in rows
        ]

        return {
            "product_id": product_id,
            "product_name": product_name,
            "trend_data": trend_data,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch product sales trend: {exc}",
        ) from exc


# PHASE 2: Sales Analysis
@router.get("/sales/categories")
def get_sales_by_category(
    year: int = Query(...),
    month: int | None = Query(default=None, ge=1, le=12),
    conn=Depends(get_db_connection),
    current_user=Depends(require_roles("admin", "manager", "storekeeper")),
):
    del current_user

    try:
        filters = ["EXTRACT(YEAR FROM st.date) = %s"]
        params = [year]
        period = str(year)

        if month is not None:
            filters.append("EXTRACT(MONTH FROM st.date) = %s")
            params.append(month)
            period = f"{year}-{month:02d}"

        with conn.cursor() as cursor:
            # Aggregate OUT movement by product category and calculate each category's share of total revenue.
            cursor.execute(
                f"""
                WITH category_sales AS (
                    SELECT
                        COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorized') AS category,
                        COALESCE(SUM(st.quantity), 0) AS units_sold,
                        COALESCE(SUM(st.quantity * COALESCE(p.price_per_unit, 0)), 0) AS revenue
                    FROM stock_transactions st
                    JOIN products p ON p.id = st.product_id
                    WHERE st.type = 'OUT'
                      AND {' AND '.join(filters)}
                    GROUP BY COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorized')
                ),
                revenue_total AS (
                    SELECT COALESCE(SUM(revenue), 0) AS total_revenue
                    FROM category_sales
                )
                SELECT
                    cs.category,
                    cs.units_sold,
                    cs.revenue,
                    CASE
                        WHEN rt.total_revenue = 0 THEN 0
                        ELSE (cs.revenue / rt.total_revenue) * 100
                    END AS pct_of_total
                FROM category_sales cs
                CROSS JOIN revenue_total rt
                ORDER BY cs.revenue DESC, cs.category ASC
                """,
                tuple(params),
            )
            rows = cursor.fetchall()

        categories = [
            {
                "category": category,
                "units_sold": units_sold,
                "revenue": round_money(revenue),
                "pct_of_total": round_margin(pct_of_total),
            }
            for category, units_sold, revenue, pct_of_total in rows
        ]

        return {
            "period": period,
            "categories": categories,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch sales by category: {exc}",
        ) from exc


# ── PHASE 6: Stock Health ──
import collections
from datetime import timedelta

@router.get("/stock-health")
def get_stock_health(conn=Depends(get_db_connection)):
    try:
        with conn.cursor() as cursor:
            # Dead stock detection query must use a LEFT JOIN on stock_transactions
            cursor.execute("""
                SELECT 
                    p.id AS product_id,
                    p.name,
                    p.sku,
                    COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorized') AS category,
                    p.current_stock,
                    p.reorder_level,
                    MAX(st.date) AS last_out_date,
                    EXISTS(SELECT 1 FROM alerts WHERE product_id = p.id AND is_resolved = FALSE) AS active_alert
                FROM products p
                LEFT JOIN stock_transactions st ON st.product_id = p.id AND st.type = 'OUT'
                GROUP BY p.id
            """)
            
            rows = cursor.fetchall()
            columns = [desc[0] for desc in cursor.description]
            products_raw = [dict(zip(columns, row)) for row in rows]
            
            products = []
            summary = {"healthy": 0, "warning": 0, "critical": 0, "out_of_stock": 0, "dead_stock": 0, "total": 0}
            now = datetime.now()
            
            for p in products_raw:
                current_stock = p["current_stock"]
                reorder_level = p["reorder_level"]
                last_out_date = p["last_out_date"]
                
                days_diff = None
                if last_out_date:
                    try:
                        diff = now - last_out_date
                    except TypeError:
                        diff = now - last_out_date.replace(tzinfo=None)
                    days_diff = diff.days

                health_status = ""
                if current_stock == 0:
                    health_status = "out_of_stock"
                elif current_stock <= reorder_level:
                    health_status = "critical"
                elif current_stock <= reorder_level * 2:
                    health_status = "warning"
                else:
                    if days_diff is None or days_diff >= 30:
                        health_status = "dead_stock"
                    else:
                        health_status = "healthy"

                summary[health_status] += 1
                summary["total"] += 1
                
                stock_ratio = float(current_stock) / max(reorder_level, 1)
                if stock_ratio > 5.0:
                    stock_ratio = 5.0
                    
                products.append({
                    "product_id": p["product_id"],
                    "name": p["name"],
                    "sku": p["sku"],
                    "category": p["category"],
                    "current_stock": current_stock,
                    "reorder_level": reorder_level,
                    "health_status": health_status,
                    "stock_ratio": round(stock_ratio, 2),
                    "days_since_last_movement": days_diff,
                    "active_alert": p["active_alert"]
                })
                
            # sorting order: out_of_stock first, critical, warning, dead_stock, healthy
            sort_order = {"out_of_stock": 0, "critical": 1, "warning": 2, "dead_stock": 3, "healthy": 4}
            products.sort(key=lambda x: (sort_order[x["health_status"]], x["name"]))
            
            return {
                "generated_at": datetime.utcnow().isoformat(),
                "summary": summary,
                "products": products
            }
            
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to calculate stock health: {exc}",
        ) from exc


@router.get("/stock-health/timeline")
def get_stock_health_timeline(
    days: int = Query(default=30, ge=1, le=90),
    conn=Depends(get_db_connection)
):
    try:
        with conn.cursor() as cursor:
            # Get products details
            cursor.execute("SELECT id, current_stock, reorder_level FROM products")
            products = {row[0]: {"stock": row[1], "reorder": row[2]} for row in cursor.fetchall()}
            
            # OUT dates for calculating dead stock locally
            cursor.execute(
                """
                SELECT product_id, DATE(date)
                FROM stock_transactions
                WHERE type = 'OUT' AND date >= CURRENT_DATE - INTERVAL '%s days'
                GROUP BY product_id, DATE(date)
                """,
                (days + 30,)
            )
            out_dates = collections.defaultdict(set)
            for row in cursor.fetchall():
                out_dates[row[0]].add(row[1])

            # Fetch transactions to reverse simulating daily levels
            cursor.execute(
                """
                SELECT product_id, DATE(date), type, COALESCE(SUM(quantity), 0)
                FROM stock_transactions
                WHERE date >= CURRENT_DATE - INTERVAL '%s days'
                GROUP BY product_id, DATE(date), type
                """,
                (days,)
            )
            daily_txns = collections.defaultdict(lambda: collections.defaultdict(lambda: {"IN": 0, "OUT": 0}))
            for row in cursor.fetchall():
                pid, d, type_, qty = row
                daily_txns[d][pid][type_] += qty
                
            today = datetime.now().date()
            timeline = []
            current_simulated = {pid: v["stock"] for pid, v in products.items()}
            
            # Walk backwards from today down to today - (days - 1)
            for i in range(days):
                d = today - timedelta(days=i)
                counts = {"healthy": 0, "warning": 0, "critical": 0, "out_of_stock": 0, "dead_stock": 0}
                
                for pid, p in products.items():
                    sim_stock = current_simulated.get(pid, 0)
                    reorder = p["reorder"]
                    
                    if sim_stock == 0:
                        counts["out_of_stock"] += 1
                    elif sim_stock <= reorder:
                        counts["critical"] += 1
                    elif sim_stock <= reorder * 2:
                        counts["warning"] += 1
                    else:
                        has_out = False
                        for past_d in range(31): 
                            check_date = d - timedelta(days=past_d)
                            if check_date in out_dates[pid]:
                                has_out = True
                                break
                        if has_out:
                            counts["healthy"] += 1
                        else:
                            counts["dead_stock"] += 1
                
                timeline.append({
                    "date": d.isoformat(),
                    "healthy": counts["healthy"],
                    "warning": counts["warning"],
                    "critical": counts["critical"],
                    "out_of_stock": counts["out_of_stock"],
                    "dead_stock": counts["dead_stock"]
                })
                
                # Reverse day d's txns to prepare for day d-1 (sim_stock_before = sim_stock_now - IN + OUT)
                for pid, txns in daily_txns[d].items():
                    current_simulated[pid] = current_simulated[pid] - txns["IN"] + txns["OUT"]
                    
            timeline.reverse()
            
            return {
                "days": days,
                "timeline": timeline
            }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch stock health timeline: {exc}",
        ) from exc
