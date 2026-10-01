from __future__ import annotations

from pydantic import BaseModel


class ProductCreate(BaseModel):
    sku: str
    name: str
    category: str = "footwear"
    manufacturer_name: str


class CorrectBody(BaseModel):
    value: str
    unit: str | None = None


class ResolveConflictBody(BaseModel):
    chosen_field_value_id: str
