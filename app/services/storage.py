"""File-type gate + R2 upload. Correction 1: reject unknown types at upload.

Allowed: .pdf, .xlsx, .csv (by extension AND content sniff where cheap).
Everything else -> 415 before any DB row or extraction work happens.
"""
from __future__ import annotations

import os
import uuid

import boto3
from fastapi import HTTPException

from app.config import settings

ALLOWED_EXTENSIONS = {".pdf", ".xlsx", ".csv"}

PDF_MAGIC = b"%PDF"
XLSX_MAGIC = b"PK\x03\x04"  # zip container


def classify_file(filename: str, head: bytes) -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {ext or '(none)'}. Allowed: pdf, xlsx, csv.")
    if ext == ".pdf" and not head.startswith(PDF_MAGIC):
        raise HTTPException(status_code=415, detail="File claims .pdf but is not a PDF.")
    if ext == ".xlsx" and not head.startswith(XLSX_MAGIC):
        raise HTTPException(status_code=415, detail="File claims .xlsx but is not a zip-based workbook.")
    if ext == ".csv" and (b"\x00" in head):
        raise HTTPException(status_code=415, detail="File claims .csv but looks binary.")
    return ext


def _r2_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint or None,
        aws_access_key_id=settings.r2_access_key_id or None,
        aws_secret_access_key=settings.r2_secret_access_key or None,
    )


def upload_to_storage(key: str, body: bytes, content_type: str) -> None:
    client = _r2_client()
    client.put_object(Bucket=settings.r2_bucket, Key=key, Body=body, ContentType=content_type)


def new_storage_key(product_id: str, filename: str) -> str:
    safe = os.path.basename(filename or "upload")
    return f"{product_id}/{uuid.uuid4()}-{safe}"
