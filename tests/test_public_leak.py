"""Spec section 8 leak test (static): the public handler's SQL must filter
verified statuses in-SQL, and its serializer must emit only label/value/unit."""
import inspect

from app.routes import public


def test_public_sql_filters_verified_in_sql():
    src = inspect.getsource(public.public_passport)
    assert "IN ('accepted','corrected')" in src or 'IN ("accepted","corrected")' in src
    # Must look up by slug, never by id param
    assert "public_slug" in src


def test_public_serializer_only_label_value_unit():
    src = inspect.getsource(public.public_passport)
    assert '"label"' in src and '"value"' in src and '"unit"' in src
    for forbidden in ("document_id", "location", "reviewed_by", "workspace_id"):
        # forbidden columns must not appear in the SELECT/serializer
        select_region = src.split("field_definitions")[0] + src.split("fields =")[-1]
        assert forbidden not in select_region, f"leak risk: {forbidden} in public route"


def test_no_auth_dependency_on_public_route():
    src = inspect.getsource(public.public_passport)
    assert "get_caller" not in src and "Caller" not in src
