"""Correction 1: unknown types rejected at upload (415), never reach extraction."""
import pytest
from fastapi import HTTPException

from app.services.storage import classify_file


def test_rejects_exe():
    with pytest.raises(HTTPException) as e:
        classify_file("malware.exe", b"MZ...")
    assert e.value.status_code == 415


def test_rejects_no_extension():
    with pytest.raises(HTTPException) as e:
        classify_file("mystery", b"hello")
    assert e.value.status_code == 415


def test_rejects_fake_pdf():
    with pytest.raises(HTTPException) as e:
        classify_file("fake.pdf", b"not a pdf at all")
    assert e.value.status_code == 415


def test_accepts_real_magic():
    assert classify_file("bom.pdf", b"%PDF-1.7 rest...") == ".pdf"
    assert classify_file("bom.xlsx", b"PK\x03\x04 rest...") == ".xlsx"
    assert classify_file("bom.csv", b"sku,name\n1,boot\n") == ".csv"
