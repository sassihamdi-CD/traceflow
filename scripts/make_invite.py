"""Mint a company invite code (admin tool).

One code per manufacturer company. Hand it out once — signup redeems it
automatically, so the manufacturer never types a second code.

Usage (inside the api container network, or any host with DB access):
    docker exec tracflow-api-1 python scripts/make_invite.py --prefix ACME --uses 5
    DATABASE_URL=postgresql://... python scripts/make_invite.py --workspace <uuid>

Prints the code to hand to the manufacturer. Only the SHA-256 hash is stored.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import secrets
import string
import sys

import psycopg

ALPHABET = "".join(c for c in (string.ascii_uppercase + string.digits) if c not in "0O1I")


def gen_code(prefix: str) -> str:
    suffix = "".join(secrets.choice(ALPHABET) for _ in range(6))
    return f"{prefix.upper()}-{suffix}" if prefix else suffix


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workspace", default=os.environ.get("WORKSPACE_ID", ""),
                    help="workspace id (default: $WORKSPACE_ID)")
    ap.add_argument("--role", default="reviewer", choices=["admin", "reviewer", "supplier", "auditor"])
    ap.add_argument("--uses", type=int, default=5, help="max redemptions (seats)")
    ap.add_argument("--days", type=int, default=90, help="expiry in days")
    ap.add_argument("--prefix", default="", help="company short name, e.g. ACME")
    args = ap.parse_args()

    if not args.workspace:
        print("error: --workspace or $WORKSPACE_ID required", file=sys.stderr)
        return 2
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("error: $DATABASE_URL required", file=sys.stderr)
        return 2

    code = gen_code(args.prefix)
    digest = hashlib.sha256(code.strip().encode()).hexdigest()
    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO invites (workspace_id, code_hash, role, max_uses, expires_at)"
                " VALUES (%s,%s,%s,%s, now() + (%s || ' days')::interval)"
                " RETURNING id",
                (args.workspace, digest, args.role, args.uses, str(args.days)),
            )
            row = cur.fetchone()
        conn.commit()

    print(f"code:       {code}")
    print(f"role:       {args.role}")
    print(f"uses:       {args.uses}")
    print(f"expires in: {args.days} days")
    print(f"invite id:  {row[0]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
