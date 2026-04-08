import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.config.database import get_db_connection
from app.routers.auth import get_current_user


router = APIRouter(dependencies=[Depends(get_current_user)])

SEASONAL_WEIGHTS = {
    1: 0.85,
    2: 0.88,
    3: 0.95,
    4: 1.00,
    5: 1.05,
    6: 0.98,
    7: 0.92,
    8: 0.95,
    9: 1.08,
    10: 1.10,
    11: 1.25,
    12: 1.30,
}

URGENCY_ORDER = {"critical": 0, "at_risk": 1, "normal": 2}


def rows_to_dicts(cursor, rows):
    columns = [description[0] for description in cursor.description]
    return [dict(zip(columns, row)) for row in rows]


def add_months(year: int, month: int, offset: int):
    total_months = (year * 12) + (month - 1) + offset
    target_year = total_months // 12
    target_month = (total_months % 12) + 1
    return target_year, target_month


def build_month_periods(count: int):
    now = datetime.now(timezone.utc)
    return [add_months(now.year, now.month, offset) for offset in range(count)]


def month_key(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def confidence_label(history_months: int) -> str:
    if history_months >= 6:
        return "high"
    if history_months >= 3:
        return "medium"
    return "low"


def determine_urgency(forecast_values, current_stock: int) -> str:
    if any(value > current_stock for value in forecast_values):
        return "critical"
    if any(value > current_stock * 0.7 for value in forecast_values):
        return "at_risk"
    return "normal"


def demand_level_for_index(seasonal_index: float) -> str:
    if seasonal_index < 0.9:
        return "low"
    if seasonal_index < 1.05:
        return "normal"
    if seasonal_index < 1.15:
        return "high"
    return "peak"


def fetch_products(conn):
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    p.id AS product_id,
                    p.name,
                    p.sku,
                    COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorized') AS category,
                    COALESCE(p.current_stock, 0) AS current_stock,
                    COALESCE(p.reorder_level, 0) AS reorder_level
                FROM products p
                ORDER BY p.name ASC
                """
            )
            return rows_to_dicts(cursor, cursor.fetchall())
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch products for forecasting: {exc}",
        ) from exc


def fetch_monthly_outbound_history(conn):
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    product_id,
                    EXTRACT(MONTH FROM date)::int AS month,
                    EXTRACT(YEAR FROM date)::int AS year,
                    COALESCE(SUM(quantity), 0)::int AS units_out
                FROM stock_transactions
                WHERE type = 'OUT'
                GROUP BY product_id, month, year
                ORDER BY product_id, year, month
                """
            )
            return rows_to_dicts(cursor, cursor.fetchall())
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch demand history: {exc}",
        ) from exc


def build_history_index(history_rows):
    history_by_product = {}
    for row in history_rows:
        product_history = history_by_product.setdefault(
            row["product_id"],
            {"history_months": 0, "total_units_out": 0},
        )
        product_history["history_months"] += 1
        product_history["total_units_out"] += int(row["units_out"] or 0)
    return history_by_product


def build_product_forecasts(products, history_by_product, periods):
    forecast_period = [month_key(year, month) for year, month in periods]
    forecast_products = []

    for product in products:
        history = history_by_product.get(
            product["product_id"],
            {"history_months": 0, "total_units_out": 0},
        )
        history_months = history["history_months"]
        monthly_average = (
            history["total_units_out"] / history_months if history_months else 0
        )

        monthly_forecast = []
        forecast_values = []
        for year, month in periods:
            seasonal_factor = SEASONAL_WEIGHTS.get(month, 1.0)
            predicted_demand = int(math.ceil(monthly_average * seasonal_factor))
            forecast_values.append(predicted_demand)
            monthly_forecast.append(
                {
                    "month": month_key(year, month),
                    "predicted_demand": predicted_demand,
                    "seasonal_factor": seasonal_factor,
                }
            )

        current_stock = int(product["current_stock"] or 0)
        reorder_level = int(product["reorder_level"] or 0)
        total_forecasted_demand = int(sum(forecast_values))
        urgency = determine_urgency(forecast_values, current_stock)

        forecast_products.append(
            {
                "product_id": int(product["product_id"]),
                "name": product["name"],
                "sku": product["sku"],
                "category": product["category"],
                "current_stock": current_stock,
                "reorder_level": reorder_level,
                "confidence": confidence_label(history_months),
                "urgency": urgency,
                "monthly_forecast": monthly_forecast,
                "total_forecasted_demand": total_forecasted_demand,
                "recommended_order_qty": max(
                    0,
                    total_forecasted_demand - current_stock + reorder_level,
                ),
            }
        )

    forecast_products.sort(
        key=lambda item: (URGENCY_ORDER[item["urgency"]], item["name"].lower())
    )
    return forecast_period, forecast_products


@router.get("/demand")
def get_demand_forecast(
    months_ahead: int = Query(default=3, ge=1, le=6),
    conn=Depends(get_db_connection),
):
    try:
        products = fetch_products(conn)
        history_rows = fetch_monthly_outbound_history(conn)
        history_by_product = build_history_index(history_rows)
        periods = build_month_periods(months_ahead)
        forecast_period, forecast_products = build_product_forecasts(
            products,
            history_by_product,
            periods,
        )

        return {
            "forecast_generated_at": datetime.now(timezone.utc).isoformat(),
            "months_ahead": months_ahead,
            "forecast_period": forecast_period,
            "products": forecast_products,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate demand forecast: {exc}",
        ) from exc


@router.get("/seasonal-calendar")
def get_seasonal_calendar(conn=Depends(get_db_connection)):
    try:
        products = fetch_products(conn)
        history_rows = fetch_monthly_outbound_history(conn)
        history_by_product = build_history_index(history_rows)
        periods = build_month_periods(12)

        calendar = []
        for year, month in periods:
            seasonal_index = SEASONAL_WEIGHTS.get(month, 1.0)
            at_risk_products = []

            for product in products:
                history = history_by_product.get(
                    product["product_id"],
                    {"history_months": 0, "total_units_out": 0},
                )
                history_months = history["history_months"]
                monthly_average = (
                    history["total_units_out"] / history_months if history_months else 0
                )
                forecast_value = int(math.ceil(monthly_average * seasonal_index))
                urgency = determine_urgency(
                    [forecast_value],
                    int(product["current_stock"] or 0),
                )

                if urgency == "normal":
                    continue

                at_risk_products.append(
                    {
                        "product_id": int(product["product_id"]),
                        "name": product["name"],
                        "urgency": urgency,
                    }
                )

            at_risk_products.sort(
                key=lambda item: (URGENCY_ORDER[item["urgency"]], item["name"].lower())
            )

            calendar.append(
                {
                    "month": month_key(year, month),
                    "seasonal_index": seasonal_index,
                    "demand_level": demand_level_for_index(seasonal_index),
                    "at_risk_products": at_risk_products,
                }
            )

        return {"calendar": calendar}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate seasonal calendar: {exc}",
        ) from exc
