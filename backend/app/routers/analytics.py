from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.config.database import get_db_connection
from app.middleware.auth import get_current_user


router = APIRouter()


def rows_to_dicts(cursor, rows):
    columns = [description[0] for description in cursor.description]
    return [dict(zip(columns, row)) for row in rows]


def row_to_dict(cursor, row):
    if row is None:
        return None
    columns = [description[0] for description in cursor.description]
    return dict(zip(columns, row))


@router.get("/dashboard")
def get_dashboard(
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    with conn.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) AS total_products FROM products")
        total_products = cursor.fetchone()[0]

        cursor.execute(
            """
            SELECT COUNT(*) AS low_stock_count
            FROM products
            WHERE current_stock <= reorder_level
            """
        )
        low_stock_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) AS total_vendors FROM vendors")
        total_vendors = cursor.fetchone()[0]

        cursor.execute(
            """
            SELECT COUNT(*) AS open_po_count
            FROM purchase_orders
            WHERE status != 'received'
            """
        )
        open_po_count = cursor.fetchone()[0]

        cursor.execute(
            """
            SELECT COUNT(*) AS pending_alerts
            FROM alerts
            WHERE is_resolved = FALSE
            """
        )
        pending_alerts = cursor.fetchone()[0]

        cursor.execute(
            """
            SELECT
                st.id,
                st.product_id,
                p.name AS product_name,
                p.sku,
                st.type,
                st.quantity,
                st.date,
                st.reference_po_id,
                st.notes
            FROM stock_transactions st
            JOIN products p ON p.id = st.product_id
            ORDER BY st.date DESC, st.id DESC
            LIMIT 5
            """
        )
        recent_transactions = rows_to_dicts(cursor, cursor.fetchall())

        cursor.execute(
            """
            SELECT
                COALESCE(category, 'Uncategorized') AS category,
                COALESCE(SUM(current_stock), 0) AS total_stock
            FROM products
            GROUP BY COALESCE(category, 'Uncategorized')
            ORDER BY category ASC
            """
        )
        stock_value_by_category = rows_to_dicts(cursor, cursor.fetchall())

    return {
        "total_products": total_products,
        "low_stock_count": low_stock_count,
        "total_vendors": total_vendors,
        "open_po_count": open_po_count,
        "pending_alerts": pending_alerts,
        "recent_transactions": recent_transactions,
        "stock_value_by_category": stock_value_by_category,
    }


@router.get("/low-stock")
def get_low_stock_products(
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
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
                p.created_at,
                v.name AS vendor_name,
                EXISTS (
                    SELECT 1
                    FROM alerts a
                    WHERE a.product_id = p.id
                      AND a.is_resolved = FALSE
                ) AS has_open_alert
            FROM products p
            LEFT JOIN vendors v ON v.id = p.vendor_id
            WHERE p.current_stock <= p.reorder_level
            ORDER BY (p.current_stock - p.reorder_level) ASC, p.name ASC
            """
        )
        return rows_to_dicts(cursor, cursor.fetchall())


@router.get("/alerts")
def list_alerts(
    resolved: Optional[bool] = None,
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    query = """
        SELECT
            a.id,
            a.product_id,
            p.name AS product_name,
            p.sku,
            a.triggered_at,
            a.resolved_at,
            a.is_resolved
        FROM alerts a
        JOIN products p ON p.id = a.product_id
        WHERE 1 = 1
    """
    params = []

    if resolved is not None:
        query += " AND a.is_resolved = %s"
        params.append(resolved)

    query += " ORDER BY a.triggered_at DESC, a.id DESC"

    with conn.cursor() as cursor:
        cursor.execute(query, tuple(params))
        return rows_to_dicts(cursor, cursor.fetchall())


@router.get("/stock-movement")
def get_stock_movement(
    product_id: Optional[int] = None,
    days: int = Query(default=30, ge=1, le=365),
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    query = """
        SELECT
            DATE(st.date) AS date,
            COALESCE(SUM(CASE WHEN st.type = 'IN' THEN st.quantity ELSE 0 END), 0) AS total_in,
            COALESCE(SUM(CASE WHEN st.type = 'OUT' THEN st.quantity ELSE 0 END), 0) AS total_out,
            COALESCE(SUM(CASE WHEN st.type = 'IN' THEN st.quantity ELSE -st.quantity END), 0) AS net
        FROM stock_transactions st
        WHERE st.date >= NOW() - (%s * INTERVAL '1 day')
    """
    params = [days]

    if product_id is not None:
        query += " AND st.product_id = %s"
        params.append(product_id)

    query += """
        GROUP BY DATE(st.date)
        ORDER BY DATE(st.date) ASC
    """

    with conn.cursor() as cursor:
        cursor.execute(query, tuple(params))
        return rows_to_dicts(cursor, cursor.fetchall())


@router.get("/top-products")
def get_top_products(
    by: str = Query(default="stock_out", pattern="^(stock_out|stock_in)$"),
    limit: int = Query(default=10, ge=1, le=100),
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    transaction_type = "OUT" if by == "stock_out" else "IN"

    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                st.product_id,
                p.name AS product_name,
                p.sku,
                COALESCE(SUM(st.quantity), 0) AS total_quantity,
                COUNT(*) AS transaction_count
            FROM stock_transactions st
            JOIN products p ON p.id = st.product_id
            WHERE st.type = %s
              AND st.date >= NOW() - INTERVAL '30 days'
            GROUP BY st.product_id, p.name, p.sku
            ORDER BY total_quantity DESC, transaction_count DESC, p.name ASC
            LIMIT %s
            """,
            (transaction_type, limit),
        )
        return rows_to_dicts(cursor, cursor.fetchall())


@router.get("/po-summary")
def get_po_summary(
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                status,
                COUNT(*) AS count,
                COALESCE(SUM(total_amount), 0) AS total_amount
            FROM purchase_orders
            GROUP BY status
            ORDER BY status ASC
            """
        )
        by_status = rows_to_dicts(cursor, cursor.fetchall())

        cursor.execute(
            """
            SELECT
                COALESCE(v.name, 'Unknown Vendor') AS vendor_name,
                COUNT(po.id) AS po_count,
                COALESCE(SUM(po.total_amount), 0) AS total_spend
            FROM purchase_orders po
            LEFT JOIN vendors v ON v.id = po.vendor_id
            GROUP BY COALESCE(v.name, 'Unknown Vendor')
            ORDER BY total_spend DESC, vendor_name ASC
            """
        )
        by_vendor = rows_to_dicts(cursor, cursor.fetchall())

    return {
        "by_status": by_status,
        "by_vendor": by_vendor,
    }


@router.get("/ai-context")
def get_ai_context(
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                COUNT(*) AS total_products,
                COALESCE(SUM(current_stock), 0) AS total_stock_value_units
            FROM products
            """
        )
        inventory_summary_row = row_to_dict(cursor, cursor.fetchone())

        cursor.execute(
            """
            SELECT
                COALESCE(category, 'Uncategorized') AS name,
                COUNT(*) AS product_count,
                COALESCE(SUM(current_stock), 0) AS total_stock
            FROM products
            GROUP BY COALESCE(category, 'Uncategorized')
            ORDER BY name ASC
            """
        )
        categories = rows_to_dicts(cursor, cursor.fetchall())

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
            WHERE p.current_stock = 0
            ORDER BY p.name ASC
            """
        )
        critical_items = rows_to_dicts(cursor, cursor.fetchall())

        cursor.execute(
            """
            SELECT
                p.id,
                p.name,
                p.sku,
                p.current_stock,
                p.reorder_level,
                v.name AS vendor_name
            FROM products p
            LEFT JOIN vendors v ON v.id = p.vendor_id
            WHERE p.current_stock > 0
              AND p.current_stock <= p.reorder_level
            ORDER BY (p.current_stock - p.reorder_level) ASC, p.name ASC
            """
        )
        low_stock_items = rows_to_dicts(cursor, cursor.fetchall())

        cursor.execute(
            """
            SELECT
                st.id,
                p.name AS product_name,
                st.type,
                st.quantity,
                st.date
            FROM stock_transactions st
            JOIN products p ON p.id = st.product_id
            ORDER BY st.date DESC, st.id DESC
            LIMIT 10
            """
        )
        recent_activity = rows_to_dicts(cursor, cursor.fetchall())

        cursor.execute(
            """
            SELECT
                po.id,
                po.status,
                v.name AS vendor_name,
                po.expected_delivery,
                (
                    SELECT COUNT(*)
                    FROM po_line_items li
                    WHERE li.po_id = po.id
                ) AS line_item_count
            FROM purchase_orders po
            LEFT JOIN vendors v ON v.id = po.vendor_id
            WHERE po.status IN ('draft', 'sent')
            ORDER BY po.created_date DESC, po.id DESC
            """
        )
        open_purchase_orders = rows_to_dicts(cursor, cursor.fetchall())

        cursor.execute(
            """
            SELECT COUNT(*) AS unresolved_count
            FROM alerts
            WHERE is_resolved = FALSE
            """
        )
        unresolved_count = cursor.fetchone()[0]

        cursor.execute(
            """
            SELECT
                p.name AS product_name,
                a.triggered_at
            FROM alerts a
            JOIN products p ON p.id = a.product_id
            WHERE a.is_resolved = FALSE
            ORDER BY a.triggered_at DESC, a.id DESC
            """
        )
        unresolved_alert_items = rows_to_dicts(cursor, cursor.fetchall())

    return {
        "snapshot_time": datetime.now(timezone.utc).isoformat(),
        "inventory_summary": {
            "total_products": inventory_summary_row["total_products"],
            "total_stock_value_units": inventory_summary_row["total_stock_value_units"],
            "categories": categories,
        },
        "critical_items": critical_items,
        "low_stock_items": low_stock_items,
        "recent_activity": recent_activity,
        "open_purchase_orders": open_purchase_orders,
        "unresolved_alerts": {
            "count": unresolved_count,
            "list": unresolved_alert_items,
        },
    }
