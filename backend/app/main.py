from fastapi import FastAPI
from app.routers import auth, inventory, vendors, purchase_orders, analytics

app = FastAPI(title="Smart Inventory & Procurement System", version="1.0.0")

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(inventory.router, prefix="/api/inventory", tags=["inventory"])
app.include_router(vendors.router, prefix="/api/vendors", tags=["vendors"])
app.include_router(purchase_orders.router, prefix="/api/purchase-orders", tags=["purchase_orders"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])

@app.get("/")
def root():
    return {"message": "Inventory Management System API is running"}
