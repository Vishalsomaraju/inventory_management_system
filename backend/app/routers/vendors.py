from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from psycopg2 import IntegrityError

from app.config.database import get_db_connection
from app.middleware.auth import get_current_user


router = APIRouter()


class VendorCreateRequest(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    payment_terms: Optional[str] = None


class VendorUpdateRequest(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    payment_terms: Optional[str] = None


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


def fetch_vendor(conn, vendor_id: int):
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                v.id,
                v.name,
                v.contact_person,
                v.phone,
                v.email,
                v.payment_terms,
                v.created_at,
                (
                    SELECT COUNT(*)
                    FROM products p
                    WHERE p.vendor_id = v.id
                ) AS product_count
            FROM vendors v
            WHERE v.id = %s
            """,
            (vendor_id,),
        )
        vendor = row_to_dict(cursor, cursor.fetchone())

        if not vendor:
            return None

        cursor.execute(
            """
            SELECT
                id,
                name,
                sku,
                category,
                unit,
                current_stock,
                reorder_level,
                reorder_quantity,
                vendor_id,
                created_at
            FROM products
            WHERE vendor_id = %s
            ORDER BY name ASC
            """,
            (vendor_id,),
        )
        vendor["products"] = rows_to_dicts(cursor, cursor.fetchall())
        return vendor


@router.get("")
def list_vendors(
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                v.id,
                v.name,
                v.contact_person,
                v.phone,
                v.email,
                v.payment_terms,
                v.created_at,
                (
                    SELECT COUNT(*)
                    FROM products p
                    WHERE p.vendor_id = v.id
                ) AS product_count
            FROM vendors v
            ORDER BY v.name ASC
            """
        )
        return rows_to_dicts(cursor, cursor.fetchall())


@router.get("/{vendor_id}")
def get_vendor(
    vendor_id: int,
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    vendor = fetch_vendor(conn, vendor_id)
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not found",
        )
    return vendor


@router.post("", status_code=status.HTTP_201_CREATED)
def create_vendor(
    payload: VendorCreateRequest,
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    require_roles(current_user, {"admin", "manager"})

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO vendors (
                    name,
                    contact_person,
                    phone,
                    email,
                    payment_terms
                )
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    payload.name,
                    payload.contact_person,
                    payload.phone,
                    payload.email,
                    payload.payment_terms,
                ),
            )
            vendor_id = cursor.fetchone()[0]
        conn.commit()
    except IntegrityError:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to create vendor",
        )
    except Exception:
        conn.rollback()
        raise

    return fetch_vendor(conn, vendor_id)


@router.put("/{vendor_id}")
def update_vendor(
    vendor_id: int,
    payload: VendorUpdateRequest,
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

    allowed_fields = {"name", "contact_person", "phone", "email", "payment_terms"}
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

    params.append(vendor_id)

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                f"""
                UPDATE vendors
                SET {", ".join(set_clauses)}
                WHERE id = %s
                RETURNING id
                """,
                tuple(params),
            )
            updated = cursor.fetchone()
        if not updated:
            conn.rollback()
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Not found",
            )
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise

    return fetch_vendor(conn, vendor_id)


@router.delete("/{vendor_id}")
def delete_vendor(
    vendor_id: int,
    current_user=Depends(get_current_user),
    conn=Depends(get_db_connection),
):
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM products
            WHERE vendor_id = %s
            """,
            (vendor_id,),
        )
        product_count = cursor.fetchone()[0]

    if product_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vendor cannot be deleted because products reference this vendor",
        )

    with conn.cursor() as cursor:
        cursor.execute(
            """
            DELETE FROM vendors
            WHERE id = %s
            RETURNING id
            """,
            (vendor_id,),
        )
        deleted = cursor.fetchone()

    if not deleted:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not found",
        )

    conn.commit()
    return {"message": "Vendor deleted successfully"}
