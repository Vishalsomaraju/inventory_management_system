import os
import psycopg2
from psycopg2 import pool
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

try:
    connection_pool = psycopg2.pool.SimpleConnectionPool(
        1, 10, DATABASE_URL
    )
except Exception as e:
    print(f"Error connecting to database: {e}")
    connection_pool = None

def get_db_connection():
    if connection_pool:
        conn = connection_pool.getconn()
        try:
            yield conn
        finally:
            connection_pool.putconn(conn)
    else:
        raise Exception("Database connection pool is not available")
