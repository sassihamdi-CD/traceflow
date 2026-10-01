"""Correction 1: XLSX/CSV coordinates come from the parser, never the model."""
import io

from openpyxl import Workbook

from app.services.extraction import build_mapping_prompt, csv_to_table, xlsx_to_table


def _sample_xlsx() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Sheet 1"
    ws["F8"] = "Full-grain leather"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_xlsx_location_is_real_coordinate():
    rows = xlsx_to_table(_sample_xlsx())
    match = [r for r in rows if r["value"] == "Full-grain leather"]
    assert len(match) == 1
    assert match[0]["sheet"] == "Sheet 1"
    assert match[0]["cell"] == "F8"


def test_mapping_prompt_demands_exact_copy():
    table = [{"sheet": "Sheet 1", "cell": "F8", "value": "Full-grain leather"}]
    defs = [{"field_key": "upper_material", "label": "Upper material"}]
    prompt = build_mapping_prompt(defs, table)
    assert "Sheet 1 / F8" in prompt or "EXACT" in prompt


def test_csv_flat_rows():
    rows = csv_to_table(b"field,value\nupper_material,leather\n")
    assert rows and rows[0]["sheet"] == "CSV"
    assert "Row 2" in rows[0]["cell"]
