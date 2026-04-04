import argparse
import requests
import sys

class InventoryAPITester:
    def __init__(self, base_url, email, password):
        self.base_url = base_url.rstrip("/")
        self.email = email
        self.password = password
        self.session = requests.Session()
        self.token = None
        
        # State variables
        self.vendor_id = None
        self.product_id = None
        self.po_id = None
        self.initial_stock = 0

    def print_result(self, step_no, name, success, details=""):
        status = "PASS" if success else "FAIL"
        print(f"Step {step_no} - {name}: {status}")
        if details:
            print(f"  -> {details}")
        if not success:
            print("Aborting due to failure.")
            sys.exit(1)

    def step_1_health_check(self):
        res = self.session.get(f"{self.base_url}/api/health")
        success = res.status_code == 200
        self.print_result(1, "Health check", success, f"Code: {res.status_code}, Body: {res.text}")

    def step_2_login(self):
        res = self.session.post(f"{self.base_url}/api/auth/login", json={
            "email": self.email,
            "password": self.password
        })
        success = res.status_code == 200
        if success:
            self.token = res.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            self.print_result(2, "Login", True, f"Got token starting with {self.token[:10]}...")
        else:
            self.print_result(2, "Login", False, f"Code: {res.status_code}, Body: {res.text}")

    def step_3_get_me(self):
        res = self.session.get(f"{self.base_url}/api/auth/me")
        success = res.status_code == 200 and res.json().get("role") == "admin"
        self.print_result(3, "Get me", success, f"Role: {res.json().get('role')}")

    def step_4_list_products(self):
        res = self.session.get(f"{self.base_url}/api/inventory/products")
        success = res.status_code == 200 and isinstance(res.json(), list) and len(res.json()) > 0
        details = f"Count: {len(res.json())}" if hasattr(res, "json") and res.status_code == 200 else str(res.text)
        self.print_result(4, "List products", success, details)

    def step_5_get_low_stock(self):
        res = self.session.get(f"{self.base_url}/api/inventory/products?low_stock=true")
        success = res.status_code == 200 and isinstance(res.json(), list)
        if success:
            details = f"Low stock count: {len(res.json())}"
        else:
            details = str(res.text)
        self.print_result(5, "Get low stock", success, details)

    def step_6_create_vendor(self):
        payload = {
            "name": "Acme API Tester Corp",
            "contact_person": "Wile E. Coyote",
            "phone": "1-800-ACME",
            "email": "wile@acme.com",
            "payment_terms": "Net 30"
        }
        res = self.session.post(f"{self.base_url}/api/vendors", json=payload)
        # Handle 200 or 201 for creation
        success = res.status_code in [200, 201] and "id" in res.json()
        if success:
            self.vendor_id = res.json()["id"]
            details = f"Vendor ID created: {self.vendor_id}"
        else:
            details = f"Code: {res.status_code}, Body: {res.text}"
        self.print_result(6, "Create vendor", success, details)

    def step_7_create_product(self):
        payload = {
            "name": "API Test Anvil",
            "sku": "ACME-ANV-001",
            "category": "Testing Equipment",
            "unit": "lbs",
            "current_stock": 0,
            "reorder_level": 5,
            "reorder_quantity": 10,
            "vendor_id": self.vendor_id
        }
        res = self.session.post(f"{self.base_url}/api/inventory/products", json=payload)
        success = res.status_code in [200, 201] and "id" in res.json()
        if success:
            self.product_id = res.json()["id"]
            details = f"Product ID created: {self.product_id}"
        else:
            details = f"Code: {res.status_code}, Body: {res.text}"
        self.print_result(7, "Create product", success, details)

    def step_8_stock_in(self):
        payload = {"quantity": 10, "notes": "Initial batch testing"}
        res = self.session.post(f"{self.base_url}/api/inventory/products/{self.product_id}/stock-in", json=payload)
        success = res.status_code == 200 and res.json().get("current_stock") == 10
        if success:
             details = f"Stock incremented to {res.json().get('current_stock')}"
        else:
             details = f"Code: {res.status_code}, Body: {res.text}"
        self.print_result(8, "Stock in (qty: 10)", success, details)

    def step_9_stock_out(self):
        payload = {"quantity": 3, "notes": "Sent out for testing"}
        res = self.session.post(f"{self.base_url}/api/inventory/products/{self.product_id}/stock-out", json=payload)
        success = res.status_code == 200 and res.json().get("current_stock") == 7
        if success:
             details = f"Stock decremented to {res.json().get('current_stock')}"
        else:
             details = f"Code: {res.status_code}, Body: {res.text}"
        self.print_result(9, "Stock out (qty: 3)", success, details)

    def step_10_stock_out_too_much(self):
        payload = {"quantity": 100, "notes": "Should fail"}
        res = self.session.post(f"{self.base_url}/api/inventory/products/{self.product_id}/stock-out", json=payload)
        success = res.status_code == 400
        self.print_result(10, "Stock out too much (qty: 100)", success, f"Code as expected: {res.status_code}, Detail: {res.json().get('detail')}")

    def step_11_create_po(self):
        import datetime
        delivery_date = (datetime.datetime.now() + datetime.timedelta(days=7)).isoformat() + "Z"
        payload = {
            "vendor_id": self.vendor_id,
            "expected_delivery": delivery_date,
            "notes": "API test order",
            "line_items": [
                {
                    "product_id": self.product_id,
                    "quantity": 15,
                    "unit_price": 50.0
                }
            ]
        }
        res = self.session.post(f"{self.base_url}/api/purchase-orders", json=payload)
        success = res.status_code in [200, 201] and "id" in res.json()
        if success:
            self.po_id = res.json()["id"]
            details = f"PO ID created: {self.po_id}"
        else:
             details = f"Code: {res.status_code}, Body: {res.text}"
        self.print_result(11, "Create PO", success, details)

    def step_12_send_po(self):
        res = self.session.post(f"{self.base_url}/api/purchase-orders/{self.po_id}/send")
        success = res.status_code == 200 and res.json().get("status") == "sent"
        self.print_result(12, "Send PO", success, f"New state: {res.json().get('status') if res.status_code == 200 else res.text}")

    def step_13_receive_po(self):
        # Fetch current stock before receiving to verify it increases
        pre_res = self.session.get(f"{self.base_url}/api/inventory/products/{self.product_id}")
        if pre_res.status_code == 200:
            pre_stock = pre_res.json().get("current_stock")
        else:
            pre_stock = 7

        res = self.session.post(f"{self.base_url}/api/purchase-orders/{self.po_id}/receive")
        
        post_res = self.session.get(f"{self.base_url}/api/inventory/products/{self.product_id}")
        post_stock = post_res.json().get("current_stock") if post_res.status_code == 200 else -1

        success = res.status_code == 200 and res.json().get("status") == "received" and post_stock > pre_stock
        details = f"State: {res.json().get('status') if res.status_code == 200 else res.text}, Stock: {pre_stock} -> {post_stock}"
        self.print_result(13, "Receive PO (stock verification)", success, details)

    def step_14_dashboard(self):
        res = self.session.get(f"{self.base_url}/api/analytics/dashboard")
        success = False
        if res.status_code == 200:
            data = res.json()
            # check typical dashboard keys
            required_keys = ["total_products", "low_stock_count", "recent_transactions"]
            if all(k in data for k in required_keys):
                success = True
            details = f"Keys present: {list(data.keys())}"
        else:
            details = f"Code: {res.status_code}, Body: {res.text}"
        self.print_result(14, "Dashboard", success, details)

    def step_15_ai_context(self):
        res = self.session.get(f"{self.base_url}/api/analytics/ai-context")
        success = False
        if res.status_code == 200:
            data = res.json()
            if "snapshot_time" in data:
                success = True
            details = f"Snapshot time: {data.get('snapshot_time')}, Key categories: {list(data.keys())}"
        else:
            details = f"Code: {res.status_code}, Body: {res.text}"
        self.print_result(15, "AI context", success, details)

    def run_all(self):
        print(f"Starting End-to-End Test for {self.base_url}")
        print("-" * 50)
        self.step_1_health_check()
        self.step_2_login()
        self.step_3_get_me()
        self.step_4_list_products()
        self.step_5_get_low_stock()
        self.step_6_create_vendor()
        self.step_7_create_product()
        self.step_8_stock_in()
        self.step_9_stock_out()
        self.step_10_stock_out_too_much()
        self.step_11_create_po()
        self.step_12_send_po()
        self.step_13_receive_po()
        self.step_14_dashboard()
        self.step_15_ai_context()
        print("-" * 50)
        print("ALL TESTS PASSED SUCCESSFULLY! ✅")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="End-to-End API Tester")
    parser.add_argument("--url", default="http://localhost:8000", help="Base URL of the API")
    parser.add_argument("--email", default="admin@example.com", help="Login email")
    parser.add_argument("--password", default="password", help="Login password (will use default seed password if applicable)")
    args = parser.parse_args()

    tester = InventoryAPITester(args.url, args.email, args.password)
    tester.run_all()
