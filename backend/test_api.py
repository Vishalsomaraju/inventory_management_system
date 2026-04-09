import urllib.request
import json
import sys

# Login with email
data = json.dumps({"email": "admin@example.com", "password": "admin123"}).encode()
req = urllib.request.Request(
    "http://localhost:8000/api/auth/login",
    data=data,
    headers={"Content-Type": "application/json"}
)
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        token_data = json.loads(resp.read())
        token = token_data.get("access_token", "")
        print("Got token:", token[:40] + "...")
except Exception as e:
    print("LOGIN FAILED:", e)
    sys.exit(1)

# Hit scorecards endpoint
req2 = urllib.request.Request(
    "http://localhost:8000/api/vendors/scorecards",
    headers={"Authorization": "Bearer " + token}
)
try:
    with urllib.request.urlopen(req2, timeout=15) as resp:
        result = json.loads(resp.read())
        vendors = result.get("vendors", [])
        print(f"\nScorecards returned {len(vendors)} vendors:")
        for v in vendors:
            metrics = v.get("metrics", {})
            print(f"  - {v['vendor_name']}: score={v['overall_score']}, grade={v['grade']}, metrics_present={'on_time_delivery' in metrics}")
        print("\nFIRST VENDOR FULL RESPONSE:")
        if vendors:
            print(json.dumps(vendors[0], indent=2))
except Exception as e:
    print("SCORECARD FAILED:", e)
