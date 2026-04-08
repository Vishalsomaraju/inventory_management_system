from datetime import date, timedelta

def check_and_generate_reorders(conn, preview: bool = False) -> list[dict]:
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT p.id, p.name, p.sku, p.current_stock, p.reorder_level, p.reorder_quantity,
                   p.vendor_id, p.cost_per_unit, v.name AS vendor_name
            FROM products p
            JOIN vendors v ON v.id = p.vendor_id
            WHERE p.current_stock <= p.reorder_level
              AND p.vendor_id IS NOT NULL
              AND p.reorder_quantity > 0
            """
        )
        
        columns = [desc[0] for desc in cursor.description]
        products = [dict(zip(columns, row)) for row in cursor.fetchall()]
        
        created_pos = []
        expected_delivery = date.today() + timedelta(days=7)
        
        for p in products:
            # Check if open auto PO exists
            cursor.execute(
                """
                SELECT 1 
                FROM purchase_orders po
                JOIN po_line_items li ON li.po_id = po.id
                WHERE li.product_id = %s
                  AND po.status IN ('draft', 'sent')
                  AND po.source = 'auto'
                LIMIT 1
                """,
                (p['id'],)
            )
            if cursor.fetchone():
                continue
                
            total_amount = p['reorder_quantity'] * p['cost_per_unit']
            
            po_id = None
            if not preview:
                # Insert draft auto PO
                cursor.execute(
                    """
                    INSERT INTO purchase_orders (vendor_id, status, source, expected_delivery, total_amount)
                    VALUES (%s, 'draft', 'auto', %s, %s)
                    RETURNING id
                    """,
                    (p['vendor_id'], expected_delivery, total_amount)
                )
                po_id = cursor.fetchone()[0]
                
                # Insert line item for auto PO
                cursor.execute(
                    """
                    INSERT INTO po_line_items (po_id, product_id, quantity, unit_price)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (po_id, p['id'], p['reorder_quantity'], p['cost_per_unit'])
                )
            
            created_pos.append({
                "po_id": po_id,
                "vendor_id": p['vendor_id'],
                "vendor_name": p['vendor_name'],
                "product_name": p['name'],
                "quantity": p['reorder_quantity'],
                "estimated_cost": total_amount
            })
            
    return created_pos
