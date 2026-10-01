from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.db import close_pool, get_pool
from app.routes import ask, documents, fields, intake, invites, notifications, ops, products, public, publish, requests, suppliers


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm the DB pool so the first request doesn't pay connect cost.
    # Never crash boot when DATABASE_URL is unset (unit tests / local import).
    if settings.database_url:
        try:
            pool = await get_pool()
            async with pool.connection() as conn:
                await conn.execute("SELECT 1")
        except Exception as exc:  # noqa: BLE001 — boot must stay up; /ready reports DB
            print(f"db warmup skipped: {type(exc).__name__}")
    yield
    await close_pool()


app = FastAPI(title="TraceFlow AI API", version="0.1.0", lifespan=lifespan)

# Browser calls come from the web app origin (different port/host).
# Auth uses Bearer tokens, so no cookies/credentials are involved.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.frontend_url.split(",") if o.strip()],
    allow_methods=["GET", "POST", "OPTIONS", "PATCH", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)

app.include_router(products.router)
app.include_router(documents.router)
app.include_router(intake.router)
app.include_router(notifications.router)
app.include_router(invites.router)
app.include_router(ask.router)
app.include_router(requests.router)
app.include_router(fields.router)
app.include_router(ops.router)
app.include_router(suppliers.router)
app.include_router(publish.router)
app.include_router(public.router)


@app.get("/health")
async def health():
    return {"ok": True}


@app.get("/ready")
async def ready():
    """Deep health: verifies DB connectivity. Railway healthcheck stays on
    /health (always 200); orchestrators / founder smoke tests use /ready."""
    if not settings.database_url:
        return JSONResponse(status_code=503, content={"ok": False, "db": "not-configured"})
    try:
        pool = await get_pool()
        async with pool.connection() as conn:
            await conn.execute("SELECT 1")
        return {"ok": True, "db": "up"}
    except Exception:
        return JSONResponse(status_code=503, content={"ok": False, "db": "down"})


@app.middleware("http")
async def security_headers(request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    return resp
