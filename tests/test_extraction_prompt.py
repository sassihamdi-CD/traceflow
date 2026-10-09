"""Claude has an explicit evidence-extractor role (not general extraction):
system prompt, footwear field semantics, output contract, output sanitizer."""
import pytest

from app.services.extraction import ExtractionParseError, parse_extraction_payload, sanitize_items
from app.services.extraction_prompts import (
    FIELD_GUIDE_FOOTWEAR,
    SYSTEM_PROMPT,
    pdf_task_instruction,
    table_task_instruction,
)

ALLOWED = {"product_name", "sku", "upper_material", "upper_composition",
           "leather_origin", "sole_material", "reach_compliance"}


def test_system_prompt_defines_role_and_bans_invention():
    assert "evidence extractor" in SYSTEM_PROMPT
    assert "OMIT" in SYSTEM_PROMPT
    for banned in ("guess", "infer"):
        assert banned in SYSTEM_PROMPT.lower()


def test_field_guide_covers_all_seven_pilot_fields():
    for key in ALLOWED:
        assert key in FIELD_GUIDE_FOOTWEAR


def test_field_guide_blocks_known_overreach_patterns():
    # Learned from real manufacturer docs (2026-09-21): generic Country of
    # Origin must not become leather_origin; RSL/PRSL mentions must not
    # become reach_compliance.
    assert "generic" in FIELD_GUIDE_FOOTWEAR
    assert "Country of Origin" in FIELD_GUIDE_FOOTWEAR
    assert "RSL" in FIELD_GUIDE_FOOTWEAR or "PRSL" in FIELD_GUIDE_FOOTWEAR


def test_task_instructions_carry_contract_and_location_rules():
    pdf = pdf_task_instruction("sku (SKU)")
    assert "Page 3" in pdf and "JSON array" in pdf
    table = table_task_instruction("sku (SKU)", '[{"sheet":"Sheet 1"}]')
    assert "Sheet 1 / F8" in table and "Do not invent" in table


def test_sanitize_drops_unknown_keys_and_empty_values():
    items = [
        {"field_key": "sku", "value": "  ABC-1 ", "unit": None, "location": "Page 1"},
        {"field_key": "invented_field", "value": "x", "unit": None, "location": "Page 1"},
        {"field_key": "sku", "value": "   ", "unit": None, "location": "Page 2"},
        {"field_key": "sku", "value": 123, "unit": None, "location": "Page 2"},
        "not-a-dict",
    ]
    out = sanitize_items(items, ALLOWED)
    assert out == [{"field_key": "sku", "value": "ABC-1", "unit": None, "location": "Page 1"}]


def test_sanitize_rejects_non_list():
    assert sanitize_items({"field_key": "sku"}, ALLOWED) == []


def test_parse_raw_array():
    assert parse_extraction_payload('[{"field_key": "sku"}]') == [{"field_key": "sku"}]


def test_parse_fenced_json():
    text = '```json\n[{"field_key": "sku"}]\n```'
    assert parse_extraction_payload(text) == [{"field_key": "sku"}]


def test_parse_prose_wrapped_and_items_dict():
    assert parse_extraction_payload('Here you go: [{"a": 1}] done') == [{"a": 1}]
    assert parse_extraction_payload('{"items": [{"a": 1}]}') == [{"a": 1}]


def test_parse_garbage_raises():
    with pytest.raises(ExtractionParseError):
        parse_extraction_payload("no values found, sorry")
