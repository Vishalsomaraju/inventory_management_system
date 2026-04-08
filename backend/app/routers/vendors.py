from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from psycopg2 import IntegrityError

from app.config.database import get_db_connection
from app.routers.auth import get_current_user


router = APIRouter(dependencies=[Depends(get_current_user)])


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
                v.created_at
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
def list_vendors(conn=Depends(get_db_connection)):
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                id,
                name,
                contact_person,
                phone,
                email,
                payment_terms,
                created_at
            FROM vendors
            ORDER BY name ASC
            """
        )
        return rows_to_dicts(cursor, cursor.fetchall())


@router.get("/{vendor_id}")
def get_vendor(vendor_id: int, conn=Depends(get_db_connection)):
    vendor = fetch_vendor(conn, vendor_id)
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor not found",
        )
    return vendor


@router.post("", status_code=status.HTTP_201_CREATED)
def create_vendor(payload: VendorCreateRequest, conn=Depends(get_db_connection)):
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
    except IntegrityError as exc:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to create vendor",
        ) from exc
    except Exception:
        conn.rollback()
        raise

    return fetch_vendor(conn, vendor_id)


@router.put("/{vendor_id}")
def update_vendor(
    vendor_id: int,
    payload: VendorUpdateRequest,
    conn=Depends(get_db_connection),
):
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields provided for update",
        )

    set_clauses = []
    params = []
    for field_name, value in data.items():
        set_clauses.append(f"{field_name} = %s")
        params.append(value)
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
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vendor not found",
            )
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise

    return fetch_vendor(conn, vendor_id)


@router.delete("/{vendor_id}")
def delete_vendor(vendor_id: int, conn=Depends(get_db_connection)):
    try:
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
                    detail="Vendor cannot be deleted because products are associated with it",
                )

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
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vendor not found",
            )

        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise

    return {"message": "Vendor deleted successfully"}


#  PHASE 4: Vendor Scorecard
import math

from fastapi import Query

from app.routers.auth import require_roles


def _phase4_clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def _phase4_round(value, digits: int = 2) -> float:
    return round(float(value or 0), digits)


def _phase4_get_vendor_or_404(conn, vendor_id: int):
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, name
                FROM vendors
                WHERE id = %s
                """,
                (vendor_id,),
            )
            vendor = cursor.fetchone()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch vendor: {exc}",
        ) from exc

    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor not found",
        )

    return {"vendor_id": vendor[0], "vendor_name": vendor[1]}


def _phase4_calculate_price_consistency(price_map):
    cvs = []
    for prices in price_map.values():
        valid_prices = [float(price) for price in prices if price is not None]
        if not valid_prices:
            continue

        mean_price = sum(valid_prices) / len(valid_prices)
        if mean_price == 0:
            continue

        variance = sum((price - mean_price) ** 2 for price in valid_prices) / len(valid_prices)
        std_dev = math.sqrt(variance)
        cvs.append(std_dev / mean_price)

    if not cvs:
        return 50.0, 0.0

    cv_average = sum(cvs) / len(cvs)
    price_consistency = _phase4_clamp(1 - cv_average)
    return price_consistency * 100, cv_average


def _phase4_grade_for_score(overall_score: float) -> str:
    if overall_score >= 90:
        return "A"
    if overall_score >= 75:
        return "B"
    if overall_score >= 60:
        return "C"
    if overall_score >= 45:
        return "D"
    return "F"


def _phase4_build_vendor_scorecard(conn, vendor_id: int):
    vendor = _phase4_get_vendor_or_404(conn, vendor_id)

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    COUNT(*) AS total_received_pos,
                    COALESCE(
                        SUM(
                            CASE
                                WHEN expected_delivery IS NOT NULL
                                 AND received_date <= expected_delivery THEN 1
                                ELSE 0
                            END
                        ),
                        0
                    ) AS on_time_pos
                FROM purchase_orders
                WHERE vendor_id = %s
                  AND status = 'received'
                  AND received_date IS NOT NULL
                """,
                (vendor_id,),
            )
            total_received_pos, on_time_pos = cursor.fetchone()

            cursor.execute(
                """
                SELECT
                    li.product_id,
                    li.unit_price
                FROM po_line_items li
                JOIN purchase_orders po ON po.id = li.po_id
                WHERE po.vendor_id = %s
                ORDER BY li.product_id ASC, li.id ASC
                """,
                (vendor_id,),
            )
            price_rows = cursor.fetchall()

            cursor.execute(
                """
                SELECT COUNT(*)
                FROM alerts a
                JOIN products p ON p.id = a.product_id
                WHERE p.vendor_id = %s
                  AND a.is_resolved = FALSE
                """,
                (vendor_id,),
            )
            active_alerts = cursor.fetchone()[0]

            cursor.execute(
                """
                SELECT
                    COUNT(*) AS total_pos,
                    COALESCE(SUM(total_amount), 0) AS total_spend,
                    COALESCE(
                        AVG(
                            EXTRACT(EPOCH FROM (received_date::timestamp - created_date::timestamp)) / 86400.0
                        ),
                        0
                    ) AS avg_delivery_days
                FROM purchase_orders
                WHERE vendor_id = %s
                """,
                (vendor_id,),
            )
            total_pos, total_spend, avg_delivery_days = cursor.fetchone()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to build vendor scorecard: {exc}",
        ) from exc

    total_received_pos = int(total_received_pos or 0)
    on_time_pos = int(on_time_pos or 0)
    if total_received_pos:
        on_time_rate = on_time_pos / total_received_pos
        score_a = on_time_rate * 100
    else:
        on_time_rate = 0.0
        score_a = 50.0

    price_map = {}
    for product_id, unit_price in price_rows:
        price_map.setdefault(int(product_id), []).append(unit_price)
    score_b, cv_average = _phase4_calculate_price_consistency(price_map)

    stockout_penalty = _phase4_clamp((active_alerts or 0) / 10) if active_alerts is not None else 0.0
    score_c = (1 - stockout_penalty) * 100

    overall_score = (score_a * 0.4) + (score_b * 0.3) + (score_c * 0.3)

    return {
        "vendor_id": vendor["vendor_id"],
        "vendor_name": vendor["vendor_name"],
        "overall_score": _phase4_round(overall_score),
        "grade": _phase4_grade_for_score(overall_score),
        "metrics": {
            "on_time_delivery": {
                "score": _phase4_round(score_a),
                "rate": _phase4_round(on_time_rate, 4),
                "total_pos": total_received_pos,
                "on_time_pos": on_time_pos,
            },
            "price_consistency": {
                "score": _phase4_round(score_b),
                "cv_average": _phase4_round(cv_average, 4),
            },
            "stockout_contribution": {
                "score": _phase4_round(score_c),
                "active_alerts": int(active_alerts or 0),
            },
        },
        "total_pos": int(total_pos or 0),
        "total_spend": _phase4_round(total_spend),
        "avg_delivery_days": _phase4_round(avg_delivery_days),
    }


@router.get("/{vendor_id}/scorecard")
def get_vendor_scorecard(
    vendor_id: int,
    conn=Depends(get_db_connection),
    current_user=Depends(require_roles("admin", "manager")),
):
    del current_user
    try:
        return _phase4_build_vendor_scorecard(conn, vendor_id)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch vendor scorecard: {exc}",
        ) from exc


@router.get("/scorecards")
def list_vendor_scorecards(
    conn=Depends(get_db_connection),
    current_user=Depends(require_roles("admin", "manager")),
):
    del current_user
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id
                FROM vendors
                ORDER BY name ASC
                """
            )
            vendor_ids = [row[0] for row in cursor.fetchall()]
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch vendor scorecards: {exc}",
        ) from exc

    try:
        vendors = []
        for vendor_id in vendor_ids:
            scorecard = _phase4_build_vendor_scorecard(conn, int(vendor_id))
            vendors.append(
                {
                    "vendor_id": scorecard["vendor_id"],
                    "vendor_name": scorecard["vendor_name"],
                    "overall_score": scorecard["overall_score"],
                    "grade": scorecard["grade"],
                    "total_pos": scorecard["total_pos"],
                    "total_spend": scorecard["total_spend"],
                }
            )

        vendors.sort(key=lambda item: (-item["overall_score"], item["vendor_name"].lower()))
        return {"vendors": vendors}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to build vendor scorecards: {exc}",
        ) from exc


@router.get("/{vendor_id}/price-history")
def get_vendor_price_history(
    vendor_id: int,
    product_id: Optional[int] = Query(default=None),
    conn=Depends(get_db_connection),
    current_user=Depends(require_roles("admin", "manager")),
):
    del current_user
    vendor = _phase4_get_vendor_or_404(conn, vendor_id)

    try:
        query = """
            SELECT
                p.id AS product_id,
                p.name AS product_name,
                COALESCE(po.received_date::date, po.created_date::date) AS price_date,
                li.unit_price,
                po.id AS po_id
            FROM po_line_items li
            JOIN purchase_orders po ON po.id = li.po_id
            JOIN products p ON p.id = li.product_id
            WHERE po.vendor_id = %s
        """
        params = [vendor_id]

        if product_id is not None:
            query += " AND p.id = %s"
            params.append(product_id)

        query += " ORDER BY p.name ASC, price_date ASC NULLS LAST, po.id ASC, li.id ASC"

        with conn.cursor() as cursor:
            cursor.execute(query, tuple(params))
            rows = cursor.fetchall()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch vendor price history: {exc}",
        ) from exc

    products = {}
    for current_product_id, product_name, price_date, unit_price, po_id in rows:
        product_entry = products.setdefault(
            int(current_product_id),
            {
                "product_id": int(current_product_id),
                "name": product_name,
                "price_history": [],
            },
        )
        product_entry["price_history"].append(
            {
                "date": price_date.isoformat() if price_date else None,
                "unit_price": _phase4_round(unit_price),
                "po_id": int(po_id),
            }
        )

    return {
        "vendor_id": vendor["vendor_id"],
        "products": list(products.values()),
    }
