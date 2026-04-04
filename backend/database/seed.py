"""
Seed script for Smart Inventory & Procurement System
Run from backend/ folder with venv active:

    python database/seed.py

Credentials seeded:
    admin@example.com       / Admin@1234
    manager@example.com     / Manager@1234
    ops@example.com         / Ops@1234
    storekeeper@example.com / Store@1234
"""

import os
import sys
import bcrypt
import psycopg2
from datetime import datetime, timedelta, date
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://admin:password@localhost:5432/inventory_db"
)

# ── Helpers ────────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()

def days_ago(n: int) -> datetime:
    return datetime.now() - timedelta(days=n)

def future_date(n: int) -> date:
    return (datetime.now() + timedelta(days=n)).date()

# ── Data definitions ───────────────────────────────────────────────────────────

USERS = [
    ("Admin User",       "admin@example.com",       "Admin@1234",    "admin"),
    ("Sarah Johnson",    "manager@example.com",      "Manager@1234",  "manager"),
    ("Raj Patel",        "ops@example.com",          "Ops@1234",      "manager"),
    ("Mark Williams",    "storekeeper@example.com",  "Store@1234",    "storekeeper"),
]

VENDORS = [
    # (name, contact_person, phone, email, payment_terms)
    ("Tech Supplies Co",     "John Doe",      "555-1234", "john@techsupplies.com",    "Net 30"),
    ("Office Essentials Ltd","Jane Smith",    "555-5678", "jane@officeessentials.com","Net 15"),
    ("FurniPro Wholesale",   "Alan Kurtz",    "555-9012", "alan@furnipro.com",        "Net 45"),
    ("Electro Hub",          "Priya Nair",    "555-3456", "priya@electrohub.com",     "Net 30"),
    ("StationaryWorld",      "Ben Clarke",    "555-7890", "ben@statworld.com",        "Net 7"),
]

# Products: (name, sku, category, unit, stock, reorder_level, reorder_qty, vendor_idx 1-based)
PRODUCTS = [
    # Electronics — vendor 1 & 4
    ("Laptop Pro 15",        "TEC-LAP-001", "Electronics",     "pcs",   50,  10, 20, 1),
    ("Laptop Pro 13",        "TEC-LAP-002", "Electronics",     "pcs",    8,  10, 15, 1),   # LOW STOCK
    ("Wireless Mouse",       "TEC-MOU-001", "Electronics",     "pcs",  150,  30, 50, 1),
    ("Mechanical Keyboard",  "TEC-KEY-001", "Electronics",     "pcs",   45,  20, 30, 4),
    ("27-inch Monitor",      "TEC-MON-001", "Electronics",     "pcs",   22,  10, 15, 4),
    ("USB-C Hub 7-port",     "TEC-HUB-001", "Electronics",     "pcs",    5,  15, 25, 4),   # LOW STOCK
    ("Webcam HD 1080p",      "TEC-CAM-001", "Electronics",     "pcs",   60,  20, 30, 4),
    ("Noise Cancel Headset", "TEC-HDS-001", "Electronics",     "pcs",   18,  10, 20, 4),

    # Office Supplies — vendor 2
    ("Printer Paper A4",     "OFF-PAP-001", "Office Supplies", "reams", 200,  50,100, 2),
    ("Ballpoint Pens Box",   "OFF-PEN-001", "Office Supplies", "boxes",  80,  20, 40, 5),
    ("Sticky Notes Pack",    "OFF-STK-001", "Office Supplies", "packs",  12,  20, 30, 5),   # LOW STOCK
    ("Stapler Heavy Duty",   "OFF-STA-001", "Office Supplies", "pcs",    25,  10, 15, 2),
    ("Filing Cabinet A4",    "OFF-FIL-001", "Office Supplies", "pcs",     9,  10, 10, 2),   # LOW STOCK
    ("Whiteboard Markers",   "OFF-MRK-001", "Office Supplies", "sets",   55,  15, 30, 5),

    # Furniture — vendor 3
    ("Ergonomic Office Chair","FUR-CHR-001","Furniture",       "pcs",   30,   5, 10, 3),
    ("Adjustable Desk",      "FUR-DSK-001", "Furniture",       "pcs",   15,   5, 10, 3),
    ("4-Shelf Bookcase",     "FUR-BKC-001", "Furniture",       "pcs",    4,   5,  8, 3),   # LOW STOCK
    ("Meeting Table 8-seat", "FUR-TBL-001", "Furniture",       "pcs",    6,   3,  5, 3),

    # IT Peripherals — vendor 4
    ("Network Switch 24-port","ITP-SWT-001","IT Peripherals",  "pcs",   10,   5, 10, 4),
    ("Cat6 Ethernet Cable 5m","ITP-CBL-001","IT Peripherals",  "rolls", 120,  20, 50, 4),
]

# ── Seed function ──────────────────────────────────────────────────────────────

def seed():
    print("Connecting to database...")
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()

    # ── Truncate existing data (cascade) ──────────────────────────────────────
    print("Clearing existing data...")
    cur.execute("""
        TRUNCATE TABLE alerts, stock_transactions, po_line_items,
                       purchase_orders, products, vendors, users
        RESTART IDENTITY CASCADE;
    """)

    # ── Users ─────────────────────────────────────────────────────────────────
    print("Seeding users...")
    user_ids = []
    for name, email, password, role in USERS:
        pw_hash = hash_password(password)
        cur.execute(
            """INSERT INTO users (name, email, password_hash, role)
               VALUES (%s, %s, %s, %s) RETURNING id""",
            (name, email, pw_hash, role)
        )
        user_ids.append(cur.fetchone()[0])
        print(f"  ✓ {email}  [{role}]  password: {password}")

    # ── Vendors ───────────────────────────────────────────────────────────────
    print("Seeding vendors...")
    vendor_ids = []
    for v in VENDORS:
        cur.execute(
            """INSERT INTO vendors (name, contact_person, phone, email, payment_terms)
               VALUES (%s, %s, %s, %s, %s) RETURNING id""", v
        )
        vendor_ids.append(cur.fetchone()[0])
        print(f"  ✓ {v[0]}")

    # ── Products ──────────────────────────────────────────────────────────────
    print("Seeding products...")
    product_ids = []
    for name, sku, cat, unit, stock, rl, rq, v_idx in PRODUCTS:
        vendor_id = vendor_ids[v_idx - 1]
        cur.execute(
            """INSERT INTO products
               (name, sku, category, unit, current_stock, reorder_level, reorder_quantity, vendor_id)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (name, sku, cat, unit, stock, rl, rq, vendor_id)
        )
        product_ids.append(cur.fetchone()[0])
        status = " ⚠ LOW" if stock <= rl else ""
        print(f"  ✓ {name} — stock: {stock}{status}")

    # ── Purchase Orders ───────────────────────────────────────────────────────
    # (vendor_idx, status, days_ago_created, expected_delivery_days_from_now,
    #  line_items: [(product_idx, qty, unit_price)])
    print("Seeding purchase orders...")

    POS = [
        # PO 1 — received, vendor 1, laptops (2 weeks ago)
        {
            "vendor": 1, "status": "received",
            "created": days_ago(14), "delivery": future_date(-7),
            "lines": [(1, 20, 1200.00), (3, 50, 25.00)]
        },
        # PO 2 — received, vendor 2, office supplies (3 weeks ago)
        {
            "vendor": 2, "status": "received",
            "created": days_ago(21), "delivery": future_date(-14),
            "lines": [(9, 100, 5.50), (10, 40, 12.00), (12, 15, 18.50)]
        },
        # PO 3 — received, vendor 3, furniture (1 month ago)
        {
            "vendor": 3, "status": "received",
            "created": days_ago(30), "delivery": future_date(-20),
            "lines": [(15, 10, 320.00), (16, 5, 480.00)]
        },
        # PO 4 — sent, vendor 4, IT peripherals (5 days ago)
        {
            "vendor": 4, "status": "sent",
            "created": days_ago(5), "delivery": future_date(10),
            "lines": [(6, 25, 55.00), (4, 30, 95.00), (20, 50, 8.00)]
        },
        # PO 5 — sent, vendor 4, monitors & webcams (3 days ago)
        {
            "vendor": 4, "status": "sent",
            "created": days_ago(3), "delivery": future_date(14),
            "lines": [(5, 10, 380.00), (7, 20, 85.00)]
        },
        # PO 6 — draft, vendor 2, stationery top-up
        {
            "vendor": 2, "status": "draft",
            "created": days_ago(1), "delivery": future_date(7),
            "lines": [(11, 30, 4.20), (13, 5, 145.00), (14, 30, 6.00)]
        },
        # PO 7 — draft, vendor 3, furniture
        {
            "vendor": 3, "status": "draft",
            "created": days_ago(0), "delivery": future_date(21),
            "lines": [(17, 8, 220.00), (18, 3, 950.00)]
        },
    ]

    po_ids = []
    for po in POS:
        vendor_id = vendor_ids[po["vendor"] - 1]
        total = sum(qty * price for _, qty, price in po["lines"])
        cur.execute(
            """INSERT INTO purchase_orders
               (vendor_id, status, created_date, expected_delivery, total_amount)
               VALUES (%s, %s, %s, %s, %s) RETURNING id""",
            (vendor_id, po["status"], po["created"], po["delivery"], total)
        )
        po_id = cur.fetchone()[0]
        po_ids.append(po_id)

        for p_idx, qty, price in po["lines"]:
            product_id = product_ids[p_idx - 1]
            cur.execute(
                """INSERT INTO po_line_items (po_id, product_id, quantity, unit_price)
                   VALUES (%s, %s, %s, %s)""",
                (po_id, product_id, qty, price)
            )

        print(f"  ✓ PO #{po_id} — {po['status']:8s}  vendor_id={vendor_id}  total=${total:,.2f}")

    # ── Stock Transactions ────────────────────────────────────────────────────
    # Simulate 30 days of movement history
    print("Seeding stock transactions...")

    # IN transactions linked to received POs
    received_pos = [POS[0], POS[1], POS[2]]
    for i, po in enumerate(received_pos):
        po_id = po_ids[i]
        for p_idx, qty, _ in po["lines"]:
            product_id = product_ids[p_idx - 1]
            cur.execute(
                """INSERT INTO stock_transactions
                   (product_id, type, quantity, date, reference_po_id, notes)
                   VALUES (%s, 'IN', %s, %s, %s, %s)""",
                (product_id, qty, po["delivery"], po_id, "Received from purchase order")
            )

    # OUT transactions — daily consumption over 30 days
    OUT_MOVEMENTS = [
        # (product_idx, days_ago, qty, notes)
        (1,  1,  2, "Issued to IT dept — new hires"),
        (1,  4,  3, "Issued to Engineering"),
        (1,  8,  2, "Issued to Sales team"),
        (1, 15,  4, "Issued to Management"),
        (3,  1,  5, "Issued — mouse replacements"),
        (3,  3,  8, "Bulk issue new office wing"),
        (3,  7,  6, "Issued to remote employees"),
        (3, 12, 10, "Issued to new joiners batch"),
        (3, 20, 12, "Quarterly issuance"),
        (4,  2,  4, "Keyboard replacements"),
        (4,  9,  6, "New hires batch"),
        (5,  3,  2, "Monitor for design team"),
        (5, 10,  3, "Monitor replacements"),
        (7,  1,  3, "Webcam for WFH employees"),
        (7,  6,  5, "Conference room setup"),
        (8,  2,  2, "Headset for call centre"),
        (9,  1, 20, "Weekly paper replenishment"),
        (9,  7, 25, "Monthly replenishment"),
        (9, 14, 30, "Bulk usage — print room"),
        (9, 21, 20, "Regular usage"),
        (10, 2, 10, "Pen replenishment"),
        (10, 9, 15, "Office wing restocking"),
        (11, 1,  8, "Sticky notes — all desks"),
        (12, 5,  3, "Stapler replacement"),
        (14, 3, 10, "Whiteboard marker restock"),
        (15, 2,  2, "Chair — new employees"),
        (15, 10, 3, "Chair replacements"),
        (16, 5,  2, "Desk for new employees"),
        (19, 4,  2, "Switch for server room"),
        (20, 2, 10, "Cable for new workstations"),
        (20, 8, 15, "Network cable roll-out"),
    ]

    for p_idx, d_ago, qty, notes in OUT_MOVEMENTS:
        product_id = product_ids[p_idx - 1]
        cur.execute(
            """INSERT INTO stock_transactions
               (product_id, type, quantity, date, notes)
               VALUES (%s, 'OUT', %s, %s, %s)""",
            (product_id, qty, days_ago(d_ago), notes)
        )

    print(f"  ✓ {len(OUT_MOVEMENTS) + len(received_pos)} transactions inserted")

    # ── Alerts ────────────────────────────────────────────────────────────────
    # Products with stock <= reorder_level: indices 2,6,11,13,17 (0-based: 1,5,10,12,16)
    print("Seeding alerts...")

    low_stock_products = [
        (product_ids[1],  days_ago(3),  False, None),   # Laptop Pro 13  — unresolved
        (product_ids[5],  days_ago(2),  False, None),   # USB-C Hub       — unresolved
        (product_ids[10], days_ago(1),  False, None),   # Sticky Notes    — unresolved
        (product_ids[12], days_ago(5),  False, None),   # Filing Cabinet  — unresolved
        (product_ids[16], days_ago(4),  False, None),   # 4-Shelf Bookcase — unresolved
        # Two older, now resolved alerts
        (product_ids[0],  days_ago(18), True,  days_ago(14)),  # Laptop Pro 15, resolved on PO receipt
        (product_ids[8],  days_ago(25), True,  days_ago(21)),  # Printer Paper, resolved on PO receipt
    ]

    for product_id, triggered_at, is_resolved, resolved_at in low_stock_products:
        cur.execute(
            """INSERT INTO alerts (product_id, triggered_at, resolved_at, is_resolved)
               VALUES (%s, %s, %s, %s)""",
            (product_id, triggered_at, resolved_at, is_resolved)
        )
        status = "resolved" if is_resolved else "ACTIVE"
        print(f"  ✓ Alert for product_id={product_id} — {status}")

    # ── Commit ────────────────────────────────────────────────────────────────
    conn.commit()
    cur.close()
    conn.close()

    print()
    print("=" * 55)
    print("  Seed complete!")
    print("=" * 55)
    print()
    print("  Login credentials:")
    print("  ─────────────────────────────────────────────────")
    for name, email, password, role in USERS:
        print(f"  {role:12s}  {email:30s}  {password}")
    print()
    print("  Summary:")
    print(f"    {len(USERS)} users | {len(VENDORS)} vendors | {len(PRODUCTS)} products")
    print(f"    {len(POS)} purchase orders | {len(OUT_MOVEMENTS)} stock movements")
    print(f"    5 active alerts | 2 resolved alerts")
    print()


if __name__ == "__main__":
    try:
        seed()
    except Exception as e:
        print(f"\n ERROR: {e}")
        print("\n  Make sure Postgres is running and DATABASE_URL is set.")
        print("  Run from the backend/ folder:")
        print("    python database/seed.py\n")
        sys.exit(1)