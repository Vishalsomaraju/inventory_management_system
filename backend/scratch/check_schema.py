import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def check_schema():
    print(f"Connecting to: {os.getenv('DATABASE_URL')}")
    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cur = conn.cursor()
        
        tables = ['products', 'purchase_orders', 'po_line_items', 'stock_transactions']
        for table in tables:
            print(f"\n--- Columns in {table} ---")
            cur.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{table}'")
            for row in cur.fetchall():
                print(f"  {row[0]}: {row[1]}")
                
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_schema()
