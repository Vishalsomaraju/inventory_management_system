from importlib import import_module

from fastapi import FastAPI

from app.routers import auth


app = FastAPI(title="Smart Inventory & Procurement System", version="1.0.0")

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])

for module_name, prefix, tags in [
    ("inventory", "/api/inventory", ["inventory"]),
    ("vendors", "/api/vendors", ["vendors"]),
    ("purchase_orders", "/api/purchase-orders", ["purchase_orders"]),
    ("analytics", "/api/analytics", ["analytics"]),
]:
    try:
        module = import_module(f"app.routers.{module_name}")
    except ModuleNotFoundError:
        continue
    app.include_router(module.router, prefix=prefix, tags=tags)


@app.get("/")
def root():
    return {"message": "Inventory Management System API is running"}
