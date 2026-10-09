from __future__ import annotations

import uuid

from pydantic import BaseModel, field_validator

from app import errors


def uuid_or_404(value: str | None, what: str = "That item") -> str:
    """Validate a path/body id as UUID before it reaches Postgres.

    An invalid UUID string would otherwise raise a psycopg DataError
    (invalid input syntax) and surface as a 500. Fail closed with 404.
    """
    try:
        uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        raise errors.not_found(what)
    return str(value)


class ProductCreate(BaseModel):
    sku: str
    name: str
    category: str = "footwear"
    manufacturer_name: str

    @field_validator("sku", "name", "manufacturer_name")
    @classmethod
    def _non_empty(cls, v: str) -> str:
        if not isinstance(v, str) or not v.strip():
            raise ValueError("must not be empty")
        return v.strip()


class CorrectBody(BaseModel):
    value: str
    unit: str | None = None

    @field_validator("value")
    @classmethod
    def _value_non_empty(cls, v: str) -> str:
        if not isinstance(v, str) or not v.strip():
            raise ValueError("value must not be empty")
        return v.strip()


class ResolveConflictBody(BaseModel):
    chosen_field_value_id: str
