import psycopg2

conn = psycopg2.connect(
    "postgresql://inventorymanagment_user:XHChmg0TTEKQRuXldNC7lBEaMBRmqjZu@dpg-d78jckdm5p6s73eo1b60-a.virginia-postgres.render.com/inventorymanagment"
)
cur = conn.cursor()
cur.execute("SELECT id, name, email, role FROM users LIMIT 5")
users = cur.fetchall()
for u in users:
    print(u)
conn.close()
