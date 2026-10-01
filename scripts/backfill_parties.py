"""Backfill detected_parties for documents uploaded before party detection.

Usage: .venv/bin/python scripts/backfill_parties.py
Reads R2 keys from the DB, fetches bytes, runs extract_parties_pdf, updates rows.
Safe to re-run: only touches rows with empty detected_parties.
"""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")


def load_env(path=".env"):
    cfg = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                cfg[k] = v
    return cfg


async def main():
    cfg = load_env()
    for k, v in cfg.items():
        os.environ.setdefault(k, v)
    import boto3
    from app.config import settings
    from app.db import get_pool
    from app.services.extraction import extract_parties_pdf

    s3 = boto3.client(
        "s3",
        endpoint_url=cfg["R2_ENDPOINT"],
        aws_access_key_id=cfg["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=cfg["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    bucket = cfg.get("R2_BUCKET") or "traceflow-docs"
    pool = await get_pool()
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT id, filename, storage_key FROM documents WHERE detected_parties = '[]'::jsonb"
        )
        docs = await cur.fetchall()
        print(f"backfill: {len(docs)} documents", flush=True)
        for did, fn, key in docs:
            did = str(did)
            try:
                if not (fn or "").lower().endswith(".pdf"):
                    print(f"  SKIP (not pdf): {fn}", flush=True)
                    continue
                body = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
                parties = await extract_parties_pdf(body)
                await conn.execute(
                    "UPDATE documents SET detected_parties = %s::jsonb WHERE id = %s",
                    (json.dumps(parties), did),
                )
                print(f"  OK {fn}: {json.dumps(parties, ensure_ascii=False)}", flush=True)
            except Exception as e:  # noqa: BLE001 - record and continue
                print(f"  FAIL {fn}: {type(e).__name__}: {str(e)[:150]}", flush=True)
    await pool.close()
    print("backfill done", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
