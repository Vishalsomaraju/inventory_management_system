from importlib import import_module
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routers import auth


app = FastAPI(title="Smart Inventory & Procurement System", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])

for module_name, prefix, tags in [
    ("inventory", "/api/inventory", ["inventory"]),
    ("vendors", "/api/vendors", ["vendors"]),
    ("purchase_orders", "/api/purchase-orders", ["purchase_orders"]),
    ("analytics", "/api/analytics", ["analytics"]),
    ("ai_chat", "/api/ai", ["ai"]),
]:
    try:
        module = import_module(f"app.routers.{module_name}")
    except ModuleNotFoundError:
        continue
    app.include_router(module.router, prefix=prefix, tags=tags)


@app.exception_handler(HTTPException)
def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail},
        headers=exc.headers,
    )


@app.exception_handler(Exception)
def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )


@app.get("/")
def root():
    return {"message": "Inventory Management System API is running"}


@app.get("/api/health")
def health_check():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}
