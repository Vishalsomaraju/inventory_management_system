import psycopg2
import math

conn = psycopg2.connect(
    'postgresql://inventorymanagment_user:XHChmg0TTEKQRuXldNC7lBEaMBRmqjZu@dpg-d78jckdm5p6s73eo1b60-a.virginia-postgres.render.com/inventorymanagment'
)
cur = conn.cursor()

# Test the exact queries the scorecard runs for vendor 1
vendor_id = 1

# Query 1: on-time delivery
cur.execute("""
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
""", (vendor_id,))
r1 = cur.fetchone()
print(f'On-time query result: total={r1[0]}, on_time={r1[1]}')

# Query 2: price rows
cur.execute("""
    SELECT li.product_id, li.unit_price
    FROM po_line_items li
    JOIN purchase_orders po ON po.id = li.po_id
    WHERE po.vendor_id = %s
    ORDER BY li.product_id ASC, li.id ASC
""", (vendor_id,))
price_rows = cur.fetchall()
print(f'Price rows: {price_rows}')

# Query 3: alerts
cur.execute("""
    SELECT COUNT(*)
    FROM alerts a
    JOIN products p ON p.id = a.product_id
    WHERE p.vendor_id = %s
      AND a.is_resolved = FALSE
""", (vendor_id,))
alerts = cur.fetchone()[0]
print(f'Active alerts: {alerts}')

# Query 4: summary
cur.execute("""
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
""", (vendor_id,))
r4 = cur.fetchone()
print(f'Summary: total_pos={r4[0]}, total_spend={r4[1]}, avg_days={r4[2]}')

conn.close()
print("All queries passed OK!")
