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
