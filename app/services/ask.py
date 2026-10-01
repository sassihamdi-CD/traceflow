"""Ask-your-data: authenticated Q&A over the workspace's structured evidence.

No new infrastructure (no vector DB per pilot spec): the model reasons over a
compact, workspace-scoped snapshot (products, field values with evidence refs
and review states, requests, suppliers). Answers must cite sources and must
label proposed vs verified values. Nothing here is public: route requires a
reviewer session, and the public passport path never touches this code.
"""
from __future__ import annotations

from anthropic import AsyncAnthropic

from app.config import settings

ASK_SYSTEM = """You answer questions about a footwear manufacturer's product-compliance
workspace. You receive a snapshot of structured data: products, extracted field
values (each with review status, source document and page/cell location),
client requests, and suppliers.

Hard rules:
1. Answer ONLY from the snapshot. If the data does not contain the answer, say
   so explicitly and suggest which document or supplier could fill the gap.
2. Every factual claim must carry its citation inline as
   [SKU → field → document / location].
3. Always distinguish VERIFIED values (accepted/corrected by a human) from
   PROPOSED values (AI-extracted, awaiting review). Never present a proposed
   value as fact.
4. Keep answers short and operational: what was asked, the answer, the source.
   No marketing language.
"""


async def build_snapshot(conn, workspace_id: str, max_values: int = 300) -> str:
    lines: list[str] = []
    cur = await conn.execute(
        "SELECT sku, name, category, manufacturer_name, passport_published"
        " FROM products WHERE workspace_id = %s ORDER BY created_at DESC LIMIT 50",
        (workspace_id,),
    )
    products = await cur.fetchall()
    lines.append(f"PRODUCTS ({len(products)}):")
    for sku, name, cat, mfr, pub in products:
        lines.append(f"- {sku} | {name} | {cat} | {mfr} | published={bool(pub)}")

    cur = await conn.execute(
        "SELECT p.sku, fv.field_key, fv.value, fv.unit, fv.status, fv.location,"
        " d.filename FROM field_values fv JOIN products p ON p.id = fv.product_id"
        " LEFT JOIN documents d ON d.id = fv.document_id"
        " WHERE fv.workspace_id = %s ORDER BY fv.created_at DESC LIMIT %s",
        (workspace_id, max_values),
    )
    rows = await cur.fetchall()
    lines.append(f"FIELD VALUES ({len(rows)}, newest first):")
    for sku, fk, val, unit, st, loc, doc in rows:
        lines.append(
            f"- [{sku}] {fk} = {val}{(' ' + unit) if unit else ''}"
            f" ({st}; {doc or 'no doc'} / {loc or 'no location'})"
        )

    cur = await conn.execute(
        "SELECT r.subject, r.requester_name, r.requester_org, r.status, p.sku"
        " FROM client_requests r JOIN products p ON p.id = r.product_id"
        " WHERE r.workspace_id = %s ORDER BY r.received_at DESC LIMIT 20",
        (workspace_id,),
    )
    reqs = await cur.fetchall()
    lines.append(f"CLIENT REQUESTS ({len(reqs)}):")
    for subj, who, org, st, sku in reqs:
        lines.append(f"- [{sku}] {subj} — {who}{(' / ' + org) if org else ''} ({st})")

    cur = await conn.execute(
        "SELECT name, external_code FROM suppliers WHERE workspace_id = %s ORDER BY name LIMIT 50",
        (workspace_id,),
    )
    sups = await cur.fetchall()
    lines.append(f"SUPPLIERS ({len(sups)}):")
    for name, code in sups:
        lines.append(f"- {name}{(' (' + code + ')') if code else ''}")
    return "\n".join(lines)


async def ask_workspace(question: str, snapshot: str) -> str:
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    resp = await client.messages.create(
        model=settings.anthropic_model,
        max_tokens=800,
        system=ASK_SYSTEM,
        messages=[{
            "role": "user",
            "content": f"WORKSPACE SNAPSHOT:\n{snapshot}\n\nQUESTION: {question}",
        }],
    )
    return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()
