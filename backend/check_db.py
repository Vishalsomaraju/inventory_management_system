import psycopg2

conn = psycopg2.connect(
    'postgresql://inventorymanagment_user:XHChmg0TTEKQRuXldNC7lBEaMBRmqjZu@dpg-d78jckdm5p6s73eo1b60-a.virginia-postgres.render.com/inventorymanagment'
)
cur = conn.cursor()

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='purchase_orders' ORDER BY ordinal_position")
cols = [r[0] for r in cur.fetchall()]
print('PO columns:', cols)

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='po_line_items' ORDER BY ordinal_position")
cols2 = [r[0] for r in cur.fetchall()]
print('po_line_items columns:', cols2)

cur.execute("SELECT id, vendor_id, status, received_date, expected_delivery FROM purchase_orders LIMIT 7")
pos = cur.fetchall()
print('POs:', pos)

cur.execute("SELECT id, po_id, product_id, unit_price FROM po_line_items LIMIT 10")
lis = cur.fetchall()
print('Line items:', lis)

conn.close()
