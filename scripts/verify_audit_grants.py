"""Phase 1 gate: confirm the app DB role cannot UPDATE/DELETE audit_log.

Usage: DATABASE_URL=<app-role-url> python scripts/verify_audit_grants.py
Exits 0 only if both UPDATE and DELETE are denied. Run before moving on.
"""
import os
import sys

import psycopg


def main() -> int:
    dsn = os.environ.get("DATABASE_URL", "")
    if not dsn:
        print("DATABASE_URL not set", file=sys.stderr)
        return 2
    ok = True
    with psycopg.connect(dsn) as conn:
        for stmt, label in [
            ("UPDATE audit_log SET action='tampered' WHERE id = gen_random_uuid()", "UPDATE"),
            ("DELETE FROM audit_log WHERE id = gen_random_uuid()", "DELETE"),
        ]:
            try:
                with conn.cursor() as cur:
                    cur.execute(stmt)
                print(f"FAIL: {label} on audit_log was ALLOWED (must be denied)")
                ok = False
            except psycopg.errors.InsufficientPrivilege:
                conn.rollback()
                print(f"OK: {label} on audit_log denied as required")
            except Exception as e:  # noqa: BLE001
                conn.rollback()
                print(f"FAIL: {label} raised unexpected error: {e}")
                ok = False
        # INSERT + SELECT must still work
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM audit_log")
                cur.fetchone()
            print("OK: SELECT on audit_log allowed")
        except Exception as e:  # noqa: BLE001
            print(f"FAIL: SELECT denied unexpectedly: {e}")
            ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
