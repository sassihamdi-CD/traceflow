/** Display-only category groups over the 7 pilot footwear fields.
 * No schema change: grouping lives here for category readiness bars and
 * the founder-demo category layout (composition / origin / certificates / identity). */

export type FieldGroup = { key: string; title: string; hint: string; fields: string[] };

export const FIELD_GROUPS: FieldGroup[] = [
  {
    key: "composition",
    title: "Material composition",
    hint: "Upper, lining and sole",
    fields: ["upper_material", "upper_composition", "sole_material"],
  },
  {
    key: "origin",
    title: "Country of origin",
    hint: "Assembly, and origin of the leather",
    fields: ["leather_origin"],
  },
  {
    key: "certificates",
    title: "Certificates",
    hint: "Current REACH declaration of conformity",
    fields: ["reach_compliance"],
  },
  {
    key: "identity",
    title: "Product identity",
    hint: "Name and SKU as printed",
    fields: ["product_name", "sku"],
  },
];

export function groupOf(fieldKey: string): FieldGroup {
  return FIELD_GROUPS.find((g) => g.fields.includes(fieldKey)) ?? FIELD_GROUPS[3];
}

export function groupReadiness(fields: { field_key: string; required: boolean; state: string }[], group: FieldGroup) {
  const req = fields.filter((f) => f.required && group.fields.includes(f.field_key));
  const verified = req.filter((f) => f.state === "verified").length;
  return { verified, total: req.length };
}
