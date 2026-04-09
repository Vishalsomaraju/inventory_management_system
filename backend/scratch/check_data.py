import psycopg2
import os
from dotenv import load_dotenv
from decimal import Decimal

load_dotenv()

def check_dashboard_data():
    database_url = os.getenv("DATABASE_URL")
    print(f"Connecting to: {database_url}")
    try:
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        
        # 1. Row counts
        tables = ['products', 'purchase_orders', 'po_line_items', 'stock_transactions', 'users']
        for table in tables:
            cur.execute(f"SELECT COUNT(*) FROM {table}")
            print(f"Table {table}: {cur.fetchone()[0]} rows")
            
        # 2. Check product health
        print("\nChecking product pricing in 'products' table:")
        cur.execute("SELECT sku, cost_per_unit, price_per_unit FROM products LIMIT 5")
        for row in cur.fetchall():
            print(f"  SKU: {row[0]}, Cost: {row[1]}, Price: {row[2]}")
            
        # 3. Test the dashboard summary queries
        print("\nTesting Dashboard Summary Queries:")
        
        # a. Inventory total products and value
        cur.execute("SELECT COUNT(*), SUM(current_stock * cost_per_unit) FROM products")
        total_p, total_v = cur.fetchone()
        print(f"  Inventory: {total_p} products, ₹{total_v} value")
        
        # b. Low stock
        cur.execute("SELECT COUNT(*) FROM products WHERE current_stock <= reorder_level")
        print(f"  Low Stock: {cur.fetchone()[0]}")
        
        # c. Revenue Today
        cur.execute("""
            SELECT COALESCE(SUM(st.quantity * p.price_per_unit), 0)
            FROM stock_transactions st
            JOIN products p ON st.product_id = p.id
            WHERE st.type = 'OUT' AND st.date >= CURRENT_DATE
        """)
        print(f"  Today Revenue: ₹{cur.fetchone()[0]}")

        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_dashboard_data()
