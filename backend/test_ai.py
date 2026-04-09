import requests
import json
import os

token_file = "e:/inventory_management_system/frontend/inv_token.txt"

def test_api():
    try:
        res = requests.post("http://127.0.0.1:8000/api/auth/login", data={"username": "admin", "password": "password"})
        token = res.json().get("access_token")
        
        url = "http://127.0.0.1:8000/api/ai/chat"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        payload = {
            "message": "Which products are running low?",
            "history": []
        }
        print(f"Testing {url}...")
        response = requests.post(url, headers=headers, json=payload)
        print(f"Status Code: {response.status_code}")
        print("Response JSON:")
        try:
            print(json.dumps(response.json(), indent=2))
        except:
            print(response.text)
    except Exception as e:
        print(e)
        
if __name__ == "__main__":
    test_api()
