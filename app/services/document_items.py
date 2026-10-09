"""Full per-document transcription (Track A).

The 7-field passport mapping in field_values stays untouched. This module
stores EVERY labeled value the document states (e.g. every chemical
substance + limit + unit + location) in document_items, shown on the
per-document view.

All entry points are failure-tolerant: any error yields [] and the caller
(the passport path) continues unaffected.
"""
from __future__ import annotations

import base64
import inspect

FULL_ITEMS_SYSTEM = (
    "You are the evidence transcriber for TraceFlow AI. "
    "Transcribe EVERY labeled value and table row stated in the supplied PDF "
    "as a JSON array of objects with exactly the keys label, value, unit, location. "
    "Copy labels and values verbatim as printed. "
    "Include a unit ONLY when the source prints one next to the value, else null. "
    "Location must pinpoint the evidence (e.g. 'Page 3'). "
    "Never invent, infer, or complete values. No prose, no markdown."
)

FULL_ITEMS_TASK = (
    "Transcribe EVERY labeled value/table row in this PDF as "
    "{label, value, unit|null, location} JSON array, verbatim, "
    "no invention, cap 200 items. "
    "Return ONLY the JSON array."
)

MAX_ITEMS = 200
MAX_LEN = 500


def parse_items_lenient(text: str) -> list[dict]:
    """Extract every COMPLETE {...} object from the reply, even when the
    model is cut off by max_tokens mid-array.

    Full transcriptions routinely exceed the token budget, so the trailing
    object is truncated and strict json.loads fails on the whole payload.
    This scanner walks top-level braces (string/escape aware) and keeps
    each object that parses, skipping the truncated tail. Never raises.
    """
    try:
        items: list[dict] = []
        depth = 0
        in_str = False
        esc = False
        start = -1
        for i, ch in enumerate(text):
            if in_str:
                if esc:
                    esc = False
                elif ch == '\\':
                    esc = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == '{':
                if depth == 0:
                    start = i
                depth += 1
            elif ch == '}':
                if depth > 0:
                    depth -= 1
                    if depth == 0 and start != -1:
                        try:
                            import json as _json

                            obj = _json.loads(text[start:i + 1])
                            if isinstance(obj, dict):
                                items.append(obj)
                        except Exception:
                            pass
                        start = -1
        return items
    except Exception:
        return []


async def extract_full_items_pdf(body: bytes) -> list[dict]:
    """Transcribe all labeled values from PDF bytes. Returns [] on any error.

    Uses its own system prompt + large token budget: the shared passport
    helper caps at 2000 tokens with the 7-field contract, which truncates
    full transcriptions mid-array (unparsable -> silently []).
    """
    try:
        from anthropic import AsyncAnthropic

        from app.config import settings
        from app.services.extraction import parse_extraction_payload

        if not settings.anthropic_api_key:
            return []
        b64 = base64.standard_b64encode(body).decode("ascii")
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        resp = await client.messages.create(
            model=settings.anthropic_model,
            max_tokens=12000,
            temperature=0,
            system=FULL_ITEMS_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "document",
                            "source": {"type": "base64", "media_type": "application/pdf", "data": b64},
                        },
                        {"type": "text", "text": FULL_ITEMS_TASK},
                    ],
                }
            ],
        )
        text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        try:
            from app.services.extraction import parse_extraction_payload

            return sanitize_doc_items(parse_extraction_payload(text))
        except Exception:
            # Truncated mid-array (max_tokens): salvage complete rows.
            return sanitize_doc_items(parse_items_lenient(text))
    except Exception as e:
        print(f"extract_full_items_pdf fallback: {type(e).__name__}")
        return []


def sanitize_doc_items(items: object) -> list[dict]:
    """Keep only well-formed rows: non-empty label+value strings.

    Truncates every string to 500 chars and caps the list at 200 items.
    Returns a TruncatedList: `.truncated` is True when the 200-item cap bit
    off rows OR any string was shortened at 500 chars, so the caller can
    surface the flag on the document row + UI badge.
    Never raises: [] on malformed input.
    """
    from app.services.extraction import TruncatedList

    clean = TruncatedList()
    try:
        if not isinstance(items, list):
            return clean
        for it in items:
            if not isinstance(it, dict):
                continue
            label = it.get("label")
            value = it.get("value")
            if not isinstance(label, str) or not label.strip():
                continue
            if not isinstance(value, str) or not value.strip():
                continue
            if len(clean) >= MAX_ITEMS:
                clean.truncated = True
                break
            unit = it.get("unit")
            location = it.get("location")
            label_s = label.strip()
            value_s = value.strip()
            unit_s = unit.strip() if isinstance(unit, str) and unit.strip() else None
            location_s = location.strip() if isinstance(location, str) and location.strip() else None
            if (len(label_s) > MAX_LEN or len(value_s) > MAX_LEN
                    or (unit_s is not None and len(unit_s) > MAX_LEN)
                    or (location_s is not None and len(location_s) > MAX_LEN)):
                clean.truncated = True
            clean.append({
                "label": label_s[:MAX_LEN],
                "value": value_s[:MAX_LEN],
                "unit": unit_s[:MAX_LEN] if unit_s is not None else None,
                "location": location_s[:MAX_LEN] if location_s is not None else None,
            })
        return clean
    except Exception:
        return clean


async def store_document_items(conn, workspace_id: str, document_id: str, items: list[dict]) -> list[dict]:
    """Bulk INSERT sanitized items. Works with async and sync connections.

    Returns the inserted rows; [] when there is nothing to store or on any
    error (caller continues).
    """
    try:
        clean = sanitize_doc_items(items)
        if not clean:
            return []
        for it in clean:
            res = conn.execute(
                "INSERT INTO document_items (workspace_id, document_id, label, value, unit, location)"
                " VALUES (%s,%s,%s,%s,%s,%s)",
                (workspace_id, document_id, it["label"], it["value"], it["unit"], it["location"]),
            )
            if inspect.isawaitable(res):
                await res
        return clean
    except Exception:
        return []
