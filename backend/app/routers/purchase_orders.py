from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from psycopg2 import IntegrityError

from app.config.database import get_db_connection
from app.middleware.auth import get_current_user


router = APIRouter()


class POLineItemRequest(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    unit_price: Decimal = Field(gt=0)


class PurchaseOrderCreateRequest(BaseModel):
    vendor_id: int
    expected_delivery: Optional[date] = None
    line_items: list[POLineItemRequest]


def row_to_dict(cursor, row):
    if row is None:
        return None
    columns = [description[0] for description in cursor.description]
    return dict(zip(columns, row))


def rows_to_dicts(cursor, rows):
    columns = [description[0] for description in cursor.description]
    return [dict(zip(columns, row)) for row in rows]


def require_roles(current_user: dict, allowed_roles: set[str]):
    if current_user["role"] not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action",
        )


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
                v.id AS vendor_detail_id,
                v.name AS vendor_name,
                v.contact_person,
                v.phone,
                v.email AS vendor_email,
                v.payment_terms,
                v.created_at AS vendor_created_at
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
        line_items = rows_to_dicts(cursor, cursor.fetchall())

    vendor = None
    if purchase_order["vendor_detail_id"] is not None:
        vendor = {
            "id": purchase_order.pop("vendor_detail_id"),
            "name": purchase_order.pop("vendor_name"),
            "contact_person": purchase_order.pop("contact_person"),
            "phone": purchase_order.pop("phone"),
            "email": purchase_order.pop("vendor_email"),
            "payment_terms": purchase_order.pop("payment_terms"),
            "created_at": purchase_order.pop("vendor_created_at"),
        }
    else:
        purchase_order.pop("vendor_detail_id")
        purchase_order.pop("vendor_name")
        purchase_order.pop("contact_person")
        purchase_order.pop("phone")
        purchase_order.pop("vendor_email")
        purchase_order.pop("payment_terms")
        purchase_order.pop("vendor_created_at")

    purchase_order["vendor"] = vendor
    purchase_order["line_items"] = line_items
    return purchase_order


@router.get("")
def list_purchase_orders(
    status_filter: Optional[str] = Query(default=None, alias="status", pattern="^(draft|sent|received)$"),
    vendor_id: Optional[int] = None,
    current_user=Depends(get_current_user),
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
            po.total_amount,
            (
                SELECT COUNT(*)
                FROM po_line_items li
                WHERE li.po_id = po.id
            ) AS line_item_count
        FROM purchase_orders po
        LEFT JOIN vendors v ON v.id = po.vendor_id
        WHERE 1 = 1
    """
    params = []

    if status_filter:
        query += " AND po.status = %s"
        params.append(status_filter)

    if vendor_id is not None:
        query += " AND po.vendor_id = %s"
        params.append(vendor_id)

    query += " ORDER BY po.created_date DESC, po.id DESC"

    with conn.cursor() as cursor:
        cursor.execute(query, tuple(params))
        return rows_to_dicts(cursor, cursor.fetchall())


@router.get("/{po_id}")
def get_purchase_order(
    po_id: int,
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    purchase_order = fetch_purchase_order(conn, po_id)
    if not purchase_order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not found",
        )
    return purchase_order


@router.post("", status_code=status.HTTP_201_CREATED)
def create_purchase_order(
    payload: PurchaseOrderCreateRequest,
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    require_roles(current_user, {"admin", "manager"})

    if not payload.line_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one line item is required",
        )

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO purchase_orders (vendor_id, status, expected_delivery, total_amount)
                VALUES (%s, 'draft', %s, 0)
                RETURNING id
                """,
                (payload.vendor_id, payload.expected_delivery),
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

            cursor.execute(
                """
                UPDATE purchase_orders
                SET total_amount = COALESCE((
                    SELECT SUM(quantity * unit_price)
                    FROM po_line_items
                    WHERE po_id = %s
                ), 0)
                WHERE id = %s
                """,
                (po_id, po_id),
            )

        conn.commit()
    except IntegrityError as exc:
        conn.rollback()
        detail = "Unable to create purchase order"
        if getattr(exc, "pgcode", None) == "23503":
            detail = "Vendor or product not found"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
    except Exception:
        conn.rollback()
        raise

    return fetch_purchase_order(conn, po_id)


@router.post("/{po_id}/send")
def send_purchase_order(
    po_id: int,
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    require_roles(current_user, {"admin", "manager"})

    with conn.cursor() as cursor:
        cursor.execute(
            """
            UPDATE purchase_orders
            SET status = 'sent'
            WHERE id = %s
              AND status = 'draft'
            RETURNING id
            """,
            (po_id,),
        )
        updated = cursor.fetchone()

    if not updated:
        conn.rollback()
        with conn.cursor() as cursor:
            cursor.execute("SELECT status FROM purchase_orders WHERE id = %s", (po_id,))
            row = cursor.fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Not found",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Purchase order can only be sent from draft status",
        )

    conn.commit()
    return fetch_purchase_order(conn, po_id)


@router.post("/{po_id}/receive")
def receive_purchase_order(
    po_id: int,
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    require_roles(current_user, {"admin", "manager"})

    previous_autocommit = conn.autocommit
    conn.autocommit = False

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
                    detail="Not found",
                )

            _, po_status = po_row
            if po_status != "sent":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Purchase order can only be received from sent status",
                )

            cursor.execute(
                """
                SELECT id, product_id, quantity
                FROM po_line_items
                WHERE po_id = %s
                ORDER BY id ASC
                """,
                (po_id,),
            )
            line_items = cursor.fetchall()

            for _, product_id, quantity in line_items:
                cursor.execute(
                    """
                    SELECT current_stock, reorder_level
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
                    RETURNING current_stock, reorder_level
                    """,
                    (quantity, product_id),
                )
                updated_stock, reorder_level = cursor.fetchone()

                if updated_stock > reorder_level:
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
    finally:
        conn.autocommit = previous_autocommit

    return fetch_purchase_order(conn, po_id)


@router.delete("/{po_id}")
def delete_purchase_order(
    po_id: int,
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    require_roles(current_user, {"admin"})

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
            detail="Not found",
        )

    if row[0] != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft purchase orders can be deleted",
        )

    with conn.cursor() as cursor:
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
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not found",
        )

    conn.commit()
    return {"message": "Purchase order deleted successfully"}
