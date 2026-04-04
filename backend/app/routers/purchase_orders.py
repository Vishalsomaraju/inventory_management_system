from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from psycopg2 import IntegrityError

from app.config.database import get_db_connection
from app.routers.auth import get_current_user


router = APIRouter(dependencies=[Depends(get_current_user)])


class POLineItemRequest(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    unit_price: Decimal = Field(gt=0)


class PurchaseOrderCreateRequest(BaseModel):
    vendor_id: int
    expected_delivery: Optional[date] = None
    line_items: list[POLineItemRequest]


class PurchaseOrderStatusUpdateRequest(BaseModel):
    status: str


def row_to_dict(cursor, row):
    if row is None:
        return None
    columns = [description[0] for description in cursor.description]
    return dict(zip(columns, row))


def rows_to_dicts(cursor, rows):
    columns = [description[0] for description in cursor.description]
    return [dict(zip(columns, row)) for row in rows]


def fetch_purchase_order(conn, po_id: int):
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                po.id,
                po.vendor_id,
                po.status,
                po.created_date,
                po.expected_delivery,
                po.total_amount,
                v.name AS vendor_name
            FROM purchase_orders po
            LEFT JOIN vendors v ON v.id = po.vendor_id
            WHERE po.id = %s
            """,
            (po_id,),
        )
        purchase_order = row_to_dict(cursor, cursor.fetchone())
        if not purchase_order:
            return None

        cursor.execute(
            """
            SELECT
                li.id,
                li.po_id,
                li.product_id,
                p.name AS product_name,
                p.sku,
                li.quantity,
                li.unit_price,
                (li.quantity * li.unit_price) AS line_total
            FROM po_line_items li
            JOIN products p ON p.id = li.product_id
            WHERE li.po_id = %s
            ORDER BY li.id ASC
            """,
            (po_id,),
        )
        purchase_order["line_items"] = rows_to_dicts(cursor, cursor.fetchall())

    return purchase_order


@router.get("")
def list_purchase_orders(
    status_filter: Optional[str] = Query(default=None, alias="status", pattern="^(draft|sent|received)$"),
    conn=Depends(get_db_connection),
):
    query = """
        SELECT
            po.id,
            po.vendor_id,
            v.name AS vendor_name,
            po.status,
            po.created_date,
            po.expected_delivery,
            po.total_amount
        FROM purchase_orders po
        LEFT JOIN vendors v ON v.id = po.vendor_id
        WHERE 1 = 1
    """
    params = []

    if status_filter:
        query += " AND po.status = %s"
        params.append(status_filter)

    query += " ORDER BY po.created_date DESC, po.id DESC"

    with conn.cursor() as cursor:
        cursor.execute(query, tuple(params))
        return rows_to_dicts(cursor, cursor.fetchall())


@router.get("/{po_id}")
def get_purchase_order(po_id: int, conn=Depends(get_db_connection)):
    purchase_order = fetch_purchase_order(conn, po_id)
    if not purchase_order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Purchase order not found",
        )
    return purchase_order


@router.post("", status_code=status.HTTP_201_CREATED)
def create_purchase_order(payload: PurchaseOrderCreateRequest, conn=Depends(get_db_connection)):
    if not payload.line_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one line item is required",
        )

    total_amount = sum(item.quantity * item.unit_price for item in payload.line_items)

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO purchase_orders (vendor_id, status, expected_delivery, total_amount)
                VALUES (%s, 'draft', %s, %s)
                RETURNING id
                """,
                (payload.vendor_id, payload.expected_delivery, total_amount),
            )
            po_id = cursor.fetchone()[0]

            for item in payload.line_items:
                cursor.execute(
                    """
                    INSERT INTO po_line_items (po_id, product_id, quantity, unit_price)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (po_id, item.product_id, item.quantity, item.unit_price),
                )
        conn.commit()
    except IntegrityError as exc:
        conn.rollback()
        if getattr(exc, "pgcode", None) == "23503":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vendor or product not found",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to create purchase order",
        ) from exc
    except Exception:
        conn.rollback()
        raise

    return fetch_purchase_order(conn, po_id)


@router.put("/{po_id}/status")
def update_purchase_order_status(
    po_id: int,
    payload: PurchaseOrderStatusUpdateRequest,
    conn=Depends(get_db_connection),
):
    if payload.status not in {"sent", "received"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be sent or received",
        )

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, status
                FROM purchase_orders
                WHERE id = %s
                FOR UPDATE
                """,
                (po_id,),
            )
            po_row = cursor.fetchone()
            if not po_row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Purchase order not found",
                )

            _, current_status = po_row
            if payload.status == "sent":
                if current_status != "draft":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Purchase order can only be sent from draft status",
                    )
                cursor.execute(
                    """
                    UPDATE purchase_orders
                    SET status = 'sent'
                    WHERE id = %s
                    """,
                    (po_id,),
                )
            else:
                if current_status != "sent":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Purchase order can only be received from sent status",
                    )

                cursor.execute(
                    """
                    SELECT product_id, quantity
                    FROM po_line_items
                    WHERE po_id = %s
                    ORDER BY id ASC
                    """,
                    (po_id,),
                )
                line_items = cursor.fetchall()

                for product_id, quantity in line_items:
                    cursor.execute(
                        """
                        SELECT id
                        FROM products
                        WHERE id = %s
                        FOR UPDATE
                        """,
                        (product_id,),
                    )
                    product_row = cursor.fetchone()
                    if not product_row:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Product {product_id} referenced by the purchase order was not found",
                        )

                    cursor.execute(
                        """
                        INSERT INTO stock_transactions (
                            product_id,
                            type,
                            quantity,
                            reference_po_id,
                            notes
                        )
                        VALUES (%s, 'IN', %s, %s, %s)
                        """,
                        (product_id, quantity, po_id, f"Received from purchase order #{po_id}"),
                    )
                    cursor.execute(
                        """
                        UPDATE products
                        SET current_stock = current_stock + %s
                        WHERE id = %s
                        """,
                        (quantity, product_id),
                    )
                    cursor.execute(
                        """
                        UPDATE alerts
                        SET is_resolved = TRUE,
                            resolved_at = NOW()
                        WHERE product_id = %s
                          AND is_resolved = FALSE
                        """,
                        (product_id,),
                    )

                cursor.execute(
                    """
                    UPDATE purchase_orders
                    SET status = 'received'
                    WHERE id = %s
                    """,
                    (po_id,),
                )
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise

    return fetch_purchase_order(conn, po_id)


@router.delete("/{po_id}")
def delete_purchase_order(po_id: int, conn=Depends(get_db_connection)):
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT status
                FROM purchase_orders
                WHERE id = %s
                """,
                (po_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Purchase order not found",
                )

            if row[0] != "draft":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Only draft purchase orders can be deleted",
                )

            cursor.execute("DELETE FROM po_line_items WHERE po_id = %s", (po_id,))
            cursor.execute(
                """
                DELETE FROM purchase_orders
                WHERE id = %s
                RETURNING id
                """,
                (po_id,),
            )
            deleted = cursor.fetchone()

        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Purchase order not found",
            )

        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise

    return {"message": "Purchase order deleted successfully"}

def create_draft_purchase_order(conn, vendor_id, items):
    """
    Creates a draft purchase order with items.

    Args:
        conn: DB connection
        vendor_id: ID of vendor
        items: list of { product_id, quantity }

    Returns:
        dict with purchase order details
    """
    try:
        with conn.cursor() as cursor:
            # 1. Create purchase order
            cursor.execute(
                """
                INSERT INTO purchase_orders (vendor_id, status, created_at)
                VALUES (%s, 'draft', NOW())
                RETURNING id
                """,
                (vendor_id,)
            )
            po_id = cursor.fetchone()[0]

            # 2. Insert items
            for item in items:
                cursor.execute(
                    """
                    INSERT INTO purchase_order_items
                    (purchase_order_id, product_id, quantity)
                    VALUES (%s, %s, %s)
                    """,
                    (
                        po_id,
                        item["product_id"],
                        item["quantity"]
                    )
                )

        conn.commit()

        return {
            "success": True,
            "purchase_order_id": po_id,
            "status": "draft",
            "items_count": len(items)
        }

    except Exception as e:
        conn.rollback()
        raise Exception(f"Failed to create draft purchase order: {e}")