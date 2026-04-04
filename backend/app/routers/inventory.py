from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from psycopg2 import IntegrityError

from app.config.database import get_db_connection
from app.routers.auth import get_current_user


router = APIRouter(dependencies=[Depends(get_current_user)])


class ProductCreateRequest(BaseModel):
    name: str
    sku: str
    category: Optional[str] = None
    unit: Optional[str] = None
    current_stock: int = 0
    reorder_level: int = 0
    reorder_quantity: int = 0
    vendor_id: Optional[int] = None


class ProductUpdateRequest(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    current_stock: Optional[int] = None
    reorder_level: Optional[int] = None
    reorder_quantity: Optional[int] = None
    vendor_id: Optional[int] = None


class StockAdjustmentRequest(BaseModel):
    type: str
    quantity: int = Field(gt=0)
    notes: Optional[str] = None


def row_to_dict(cursor, row):
    if row is None:
        return None
    columns = [description[0] for description in cursor.description]
    return dict(zip(columns, row))


def rows_to_dicts(cursor, rows):
    columns = [description[0] for description in cursor.description]
    return [dict(zip(columns, row)) for row in rows]


def ensure_alert_state(conn, product_id: int, current_stock: int, reorder_level: int):
    with conn.cursor() as cursor:
        if current_stock <= reorder_level:
            cursor.execute(
                """
                INSERT INTO alerts (product_id)
                SELECT %s
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM alerts
                    WHERE product_id = %s
                      AND is_resolved = FALSE
                )
                """,
                (product_id, product_id),
            )
        else:
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


def fetch_product(conn, product_id: int):
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
                v.contact_person,
                v.phone,
                v.email AS vendor_email,
                v.payment_terms
            FROM products p
            LEFT JOIN vendors v ON v.id = p.vendor_id
            WHERE p.id = %s
            """,
            (product_id,),
        )
        product = row_to_dict(cursor, cursor.fetchone())

    if not product:
        return None

    product["vendor"] = None
    if product["vendor_id"] is not None:
        product["vendor"] = {
            "id": product["vendor_id"],
            "name": product["vendor_name"],
            "contact_person": product["contact_person"],
            "phone": product["phone"],
            "email": product["vendor_email"],
            "payment_terms": product["payment_terms"],
        }

    product.pop("contact_person")
    product.pop("phone")
    product.pop("vendor_email")
    product.pop("payment_terms")
    return product


@router.get("/products")
def list_products(
    category: Optional[str] = None,
    search: Optional[str] = None,
    low_stock: bool = Query(default=False),
    conn=Depends(get_db_connection),
):
    query = """
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
            v.name AS vendor_name
        FROM products p
        LEFT JOIN vendors v ON v.id = p.vendor_id
        WHERE 1 = 1
    """
    params = []

    if category:
        query += " AND p.category = %s"
        params.append(category)

    if search:
        term = f"%{search}%"
        query += " AND (p.name ILIKE %s OR p.sku ILIKE %s OR p.category ILIKE %s)"
        params.extend([term, term, term])

    if low_stock:
        query += " AND p.current_stock <= p.reorder_level"

    query += " ORDER BY p.name ASC"

    with conn.cursor() as cursor:
        cursor.execute(query, tuple(params))
        return rows_to_dicts(cursor, cursor.fetchall())


@router.get("/products/{product_id}")
def get_product(product_id: int, conn=Depends(get_db_connection)):
    product = fetch_product(conn, product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


@router.post("/products", status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreateRequest, conn=Depends(get_db_connection)):
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO products (
                    name,
                    sku,
                    category,
                    unit,
                    current_stock,
                    reorder_level,
                    reorder_quantity,
                    vendor_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, current_stock, reorder_level
                """,
                (
                    payload.name,
                    payload.sku,
                    payload.category,
                    payload.unit,
                    payload.current_stock,
                    payload.reorder_level,
                    payload.reorder_quantity,
                    payload.vendor_id,
                ),
            )
            product_id, current_stock, reorder_level = cursor.fetchone()
            ensure_alert_state(conn, product_id, current_stock, reorder_level)
        conn.commit()
    except IntegrityError as exc:
        conn.rollback()
        if getattr(exc, "pgcode", None) == "23505":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Product SKU already exists") from exc
        if getattr(exc, "pgcode", None) == "23503":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vendor not found") from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to create product") from exc
    except Exception:
        conn.rollback()
        raise

    return fetch_product(conn, product_id)


@router.put("/products/{product_id}")
def update_product(
    product_id: int,
    payload: ProductUpdateRequest,
    conn=Depends(get_db_connection),
):
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields provided for update")

    set_clauses = []
    params = []
    for field_name, value in data.items():
        set_clauses.append(f"{field_name} = %s")
        params.append(value)
    params.append(product_id)

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                f"""
                UPDATE products
                SET {", ".join(set_clauses)}
                WHERE id = %s
                RETURNING id, current_stock, reorder_level
                """,
                tuple(params),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
            _, current_stock, reorder_level = row
            ensure_alert_state(conn, product_id, current_stock, reorder_level)
        conn.commit()
    except IntegrityError as exc:
        conn.rollback()
        if getattr(exc, "pgcode", None) == "23505":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Product SKU already exists") from exc
        if getattr(exc, "pgcode", None) == "23503":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vendor not found") from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to update product") from exc
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise

    return fetch_product(conn, product_id)


@router.delete("/products/{product_id}")
def delete_product(product_id: int, conn=Depends(get_db_connection)):
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM products
                WHERE id = %s
                RETURNING id
                """,
                (product_id,),
            )
            deleted = cursor.fetchone()
        if not deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise

    return {"message": "Product deleted successfully"}


@router.post("/products/{product_id}/stock")
def adjust_stock(
    product_id: int,
    payload: StockAdjustmentRequest,
    conn=Depends(get_db_connection),
):
    if payload.type not in {"IN", "OUT"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Stock type must be IN or OUT")

    try:
        with conn.cursor() as cursor:
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
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

            current_stock, _ = product_row
            if payload.type == "OUT" and current_stock - payload.quantity < 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Insufficient stock for this adjustment",
                )

            cursor.execute(
                """
                INSERT INTO stock_transactions (product_id, type, quantity, notes)
                VALUES (%s, %s, %s, %s)
                RETURNING id, date
                """,
                (product_id, payload.type, payload.quantity, payload.notes),
            )
            transaction_id, transaction_date = cursor.fetchone()

            delta = payload.quantity if payload.type == "IN" else -payload.quantity
            cursor.execute(
                """
                UPDATE products
                SET current_stock = current_stock + %s
                WHERE id = %s
                RETURNING current_stock, reorder_level
                """,
                (delta, product_id),
            )
            new_stock, reorder_level = cursor.fetchone()
            ensure_alert_state(conn, product_id, new_stock, reorder_level)
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise

    return {
        "id": transaction_id,
        "product_id": product_id,
        "type": payload.type,
        "quantity": payload.quantity,
        "notes": payload.notes,
        "date": transaction_date,
        "current_stock": new_stock,
    }


@router.get("/alerts")
def list_alerts(conn=Depends(get_db_connection)):
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                a.id,
                a.product_id,
                a.triggered_at,
                a.resolved_at,
                a.is_resolved,
                p.name AS product_name,
                p.sku,
                p.category,
                p.current_stock,
                p.reorder_level,
                p.reorder_quantity
            FROM alerts a
            JOIN products p ON p.id = a.product_id
            WHERE a.is_resolved = FALSE
            ORDER BY a.triggered_at DESC
            """
        )
        return rows_to_dicts(cursor, cursor.fetchall())


@router.put("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: int, conn=Depends(get_db_connection)):
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE alerts
                SET is_resolved = TRUE,
                    resolved_at = NOW()
                WHERE id = %s
                RETURNING id, product_id, triggered_at, resolved_at, is_resolved
                """,
                (alert_id,),
            )
            row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise

    return {
        "id": row[0],
        "product_id": row[1],
        "triggered_at": row[2],
        "resolved_at": row[3],
        "is_resolved": row[4],
    }
