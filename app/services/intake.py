"""Email-ready client-request intake.

Paste path (now): reviewer pastes the client email subject + body into the
console; we extract EVERY requirement verbatim and itemize it.
Webhook path (later): POST /api/intake/email receives the provider payload
and runs the same create path. See app/routes/intake.py (stub).

Reads stay strict; writes require a reviewer session (enforced at the router).
"""
from __future__ import annotations

import json

from anthropic import AsyncAnthropic

from app.config import settings
from app.services.extraction import parse_extraction_payload

INTAKE_SYSTEM = (
    "You extract EVERY client requirement as {label, value, unit|null} verbatim "
    "(colors, sizes, materials, quantities, packaging, deadlines, compliance); "
    "never invent; cap 100. "
    "Output STRICT JSON only: an array of objects with exactly the keys "
    "label, value, unit (unit is a string or null). "
    "Copy values word-for-word from the email; never paraphrase, normalize, "
    "or invent requirements that are not stated. "
    "If the email states no concrete requirements, output []. "
    "No prose, no markdown."
)

MAX_ITEMS = 100


class IntakeError(Exception):
    """Requirement extraction failed (AI unavailable or unparseable reply)."""


async def extract_requirements(subject: str, body_text: str) -> list[dict]:
    """Extract every client requirement verbatim. Never invents; cap 100.

    Raises IntakeError on any failure (missing key, transport error,
    unparseable model reply) so the caller returns 502 instead of a
    silently incomplete intake.
    """
    # cap 100 enforced both in the prompt and here after sanitizing.
    if not settings.anthropic_api_key:
        raise IntakeError("AI not configured")
    try:
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        resp = await client.messages.create(
            model=settings.anthropic_model,
            max_tokens=2000,
            system=INTAKE_SYSTEM,
            messages=[{
                "role": "user",
                "content": f"SUBJECT: {subject}\n\nBODY:\n{body_text}\n\nExtract every requirement. JSON array only.",
            }],
        )
        text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        raw = parse_extraction_payload(text)
    except IntakeError:
        raise
    except Exception as e:  # noqa: BLE001 - mapped to IntakeError, class only surfaces
        raise IntakeError(f"extraction failed: {type(e).__name__}") from e
    clean: list[dict] = []
    if isinstance(raw, list):
        for it in raw:
            if not isinstance(it, dict):
                continue
            label = it.get("label")
            value = it.get("value")
            if not isinstance(label, str) or not label.strip():
                continue
            if not isinstance(value, str) or not value.strip():
                continue
            unit = it.get("unit")
            clean.append({
                "label": label.strip()[:200],
                "value": value.strip()[:1000],
                "unit": unit if isinstance(unit, str) else None,
            })
            if len(clean) >= MAX_ITEMS:  # cap 100
                break
    return clean


async def create_intake(
    conn,
    workspace_id: str,
    actor: str,
    subject: str,
    body_text: str,
    from_email: str | None = None,
) -> dict:
    """One transaction: extract → product dossier + request → items → notification → audit.

    client_requests.product_id is NOT NULL (migrations/004_requests.sql), so an
    email with no linked dossier opens a placeholder product dossier first
    (same pattern as POST /api/requests with new_product).
    Returns {request_id, items_count}.
    """
    items = await extract_requirements(subject, body_text)
    requester_name = (from_email or "").strip() or "Email intake"
    async with conn.transaction():
        import nanoid as _nanoid

        slug = _nanoid.generate(size=12)
        sku = f"INTAKE-{slug[:8].upper()}"
        cur = await conn.execute(
            "INSERT INTO products (workspace_id, sku, name, category,"
            " manufacturer_name, public_slug) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id",
            (workspace_id, sku, subject[:200] or "Email intake", "footwear", requester_name, slug),
        )
        product_id = str((await cur.fetchone())[0])
        cur = await conn.execute(
            "INSERT INTO client_requests (workspace_id, product_id, requester_name,"
            " subject, message) VALUES (%s,%s,%s,%s,%s) RETURNING id",
            (workspace_id, product_id, requester_name, subject, body_text),
        )
        request_id = str((await cur.fetchone())[0])
        for it in items:
            await conn.execute(
                "INSERT INTO request_items (request_id, label, value, unit)"
                " VALUES (%s,%s,%s,%s)",
                (request_id, it["label"], it["value"], it["unit"]),
            )
        # Manager notification: one row per intake, links back to the request.
        title = f"New product request: {subject}"[:120]
        await conn.execute(
            "INSERT INTO notifications (workspace_id, type, title, body, entity_type, entity_id)"
            " VALUES (%s,'request.received',%s,%s,'client_request',%s)",
            (workspace_id, title, body_text[:500], request_id),
        )
        await conn.execute(
            "INSERT INTO audit_log (workspace_id, actor, action, entity_type, entity_id, detail)"
            " VALUES (%s,%s,'request.created','client_request',%s,%s::jsonb)",
            (workspace_id, actor, request_id,
             json.dumps({"subject": subject[:200], "items_count": len(items)})),
        )
    return {"request_id": request_id, "items_count": len(items)}
