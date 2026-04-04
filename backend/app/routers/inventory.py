from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from psycopg2 import IntegrityError

from app.config.database import get_db_connection
from app.middleware.auth import get_current_user


router = APIRouter()


class ProductCreateRequest(BaseModel):
    name: str
    sku: str
    category: Optional[str] = None
    unit: Optional[str] = None
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


class StockInRequest(BaseModel):
    quantity: int = Field(gt=0)
    notes: Optional[str] = None
    reference_po_id: Optional[int] = None


class StockOutRequest(BaseModel):
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


def require_roles(current_user: dict, allowed_roles: set[str]):
    if current_user["role"] not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action",
        )


def fetch_product_summary(conn, product_id: int):
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
                v.name AS vendor_name
            FROM products p
            LEFT JOIN vendors v ON v.id = p.vendor_id
            WHERE p.id = %s
            """,
            (product_id,),
        )
        return row_to_dict(cursor, cursor.fetchone())


@router.get("/products")
def list_products(
    category: Optional[str] = None,
    search: Optional[str] = None,
    low_stock: bool = False,
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
        query += " AND (p.name ILIKE %s OR p.sku ILIKE %s)"
        search_term = f"%{search}%"
        params.extend([search_term, search_term])

    if low_stock:
        query += " AND p.current_stock <= p.reorder_level"

    query += " ORDER BY p.name ASC"

    with conn.cursor() as cursor:
        cursor.execute(query, tuple(params))
        return rows_to_dicts(cursor, cursor.fetchall())


@router.get("/products/{product_id}")
def get_product(product_id: int, conn=Depends(get_db_connection)):
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
                v.id AS vendor_detail_id,
                v.name AS vendor_name,
                v.contact_person,
                v.phone,
                v.email AS vendor_email,
                v.payment_terms,
                v.created_at AS vendor_created_at
            FROM products p
            LEFT JOIN vendors v ON v.id = p.vendor_id
            WHERE p.id = %s
            """,
            (product_id,),
        )
        row = cursor.fetchone()
        product = row_to_dict(cursor, row)

    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not found",
        )

    vendor = None
    if product["vendor_detail_id"] is not None:
        vendor = {
            "id": product.pop("vendor_detail_id"),
            "name": product["vendor_name"],
            "contact_person": product.pop("contact_person"),
            "phone": product.pop("phone"),
            "email": product.pop("vendor_email"),
            "payment_terms": product.pop("payment_terms"),
            "created_at": product.pop("vendor_created_at"),
        }
    else:
        product.pop("vendor_detail_id")
        product.pop("contact_person")
        product.pop("phone")
        product.pop("vendor_email")
        product.pop("payment_terms")
        product.pop("vendor_created_at")

    product["vendor"] = vendor
    return product


@router.post("/products", status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductCreateRequest,
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    require_roles(current_user, {"admin", "manager"})

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO products (
                    name,
                    sku,
                    category,
                    unit,
                    reorder_level,
                    reorder_quantity,
                    vendor_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    payload.name,
                    payload.sku,
                    payload.category,
                    payload.unit,
                    payload.reorder_level,
                    payload.reorder_quantity,
                    payload.vendor_id,
                ),
            )
            product_id = cursor.fetchone()[0]
        conn.commit()
    except IntegrityError as exc:
        conn.rollback()
        detail = "Unable to create product"
        if getattr(exc, "pgcode", None) == "23505":
            detail = "Product with this SKU already exists"
        elif getattr(exc, "pgcode", None) == "23503":
            detail = "Vendor not found"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
    except Exception:
        conn.rollback()
        raise

    product = fetch_product_summary(conn, product_id)
    return product


@router.put("/products/{product_id}")
def update_product(
    product_id: int,
    payload: ProductUpdateRequest,
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    require_roles(current_user, {"admin", "manager"})

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields provided for update",
        )

    allowed_fields = {
        "name",
        "sku",
        "category",
        "unit",
        "current_stock",
        "reorder_level",
        "reorder_quantity",
        "vendor_id",
    }

    set_clauses = []
    params = []
    for field_name, value in update_data.items():
        if field_name not in allowed_fields:
            continue
        set_clauses.append(f"{field_name} = %s")
        params.append(value)

    if not set_clauses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid fields provided for update",
        )

    params.append(product_id)

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                f"""
                UPDATE products
                SET {", ".join(set_clauses)}
                WHERE id = %s
                RETURNING id
                """,
                tuple(params),
            )
            row = cursor.fetchone()
        if not row:
            conn.rollback()
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Not found",
            )
        conn.commit()
    except IntegrityError as exc:
        conn.rollback()
        detail = "Unable to update product"
        if getattr(exc, "pgcode", None) == "23505":
            detail = "Product with this SKU already exists"
        elif getattr(exc, "pgcode", None) == "23503":
            detail = "Vendor not found"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise

    return fetch_product_summary(conn, product_id)


@router.delete("/products/{product_id}")
def delete_product(
    product_id: int,
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    require_roles(current_user, {"admin"})

    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT EXISTS(
                SELECT 1
                FROM stock_transactions
                WHERE product_id = %s
            )
            """,
            (product_id,),
        )
        has_transactions = cursor.fetchone()[0]

    if has_transactions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Product cannot be deleted because stock transactions exist",
        )

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
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not found",
        )

    conn.commit()
    return {"message": "Product deleted successfully"}


@router.post("/products/{product_id}/stock-in")
def stock_in_product(
    product_id: int,
    payload: StockInRequest,
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    require_roles(current_user, {"admin", "manager"})

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, current_stock, reorder_level
                FROM products
                WHERE id = %s
                FOR UPDATE
                """,
                (product_id,),
            )
            product_row = cursor.fetchone()
            if not product_row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Not found",
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
                (product_id, payload.quantity, payload.reference_po_id, payload.notes),
            )

            cursor.execute(
                """
                UPDATE products
                SET current_stock = current_stock + %s
                WHERE id = %s
                RETURNING current_stock, reorder_level
                """,
                (payload.quantity, product_id),
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

        conn.commit()
    except IntegrityError as exc:
        conn.rollback()
        detail = "Unable to record stock-in transaction"
        if getattr(exc, "pgcode", None) == "23503":
            detail = "Product or reference purchase order not found"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise

    return fetch_product_summary(conn, product_id)


@router.post("/products/{product_id}/stock-out")
def stock_out_product(
    product_id: int,
    payload: StockOutRequest,
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    require_roles(current_user, {"admin", "manager"})

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
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Not found",
                )

            current_stock, _ = product_row
            if current_stock < payload.quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Insufficient stock available",
                )

            cursor.execute(
                """
                INSERT INTO stock_transactions (
                    product_id,
                    type,
                    quantity,
                    notes
                )
                VALUES (%s, 'OUT', %s, %s)
                """,
                (product_id, payload.quantity, payload.notes),
            )

            cursor.execute(
                """
                UPDATE products
                SET current_stock = current_stock - %s
                WHERE id = %s
                RETURNING current_stock, reorder_level
                """,
                (payload.quantity, product_id),
            )
            updated_stock, reorder_level = cursor.fetchone()

            if updated_stock <= reorder_level:
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

        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise

    return fetch_product_summary(conn, product_id)


@router.get("/transactions")
def list_transactions(
    product_id: Optional[int] = None,
    type: Optional[str] = Query(default=None, pattern="^(IN|OUT)$"),
    limit: int = Query(default=50, ge=1, le=500),
    conn=Depends(get_db_connection),
):
    query = """
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
        WHERE 1 = 1
    """
    params = []

    if product_id is not None:
        query += " AND st.product_id = %s"
        params.append(product_id)

    if type:
        query += " AND st.type = %s"
        params.append(type)

    query += " ORDER BY st.date DESC LIMIT %s"
    params.append(limit)

    with conn.cursor() as cursor:
        cursor.execute(query, tuple(params))
        return rows_to_dicts(cursor, cursor.fetchall())
