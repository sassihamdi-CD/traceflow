/** Short reviewer-facing explanations for each pilot field: what it is,
 * and which document normally proves it. Shown under every field label. */

export const FIELD_DESCRIPTIONS: Record<string, { what: string; proof: string }> = {
  product_name: {
    what: "Commercial name of the product as printed on its documents.",
    proof: "Lab report sample description, tech pack, or BOM header.",
  },
  sku: {
    what: "Exact article / model / SAP code identifying this product.",
    proof: "Lab report header, brand material code, or BOM line.",
  },
  upper_material: {
    what: "Main material of the shoe upper (e.g. full-grain leather, textile).",
    proof: "Supplier material declaration or lab composition claim.",
  },
  upper_composition: {
    what: "Material breakdown of the upper with shares (e.g. Leather 80%, textile 20%).",
    proof: "Lab report 'composition claimed' box or supplier declaration.",
  },
  leather_origin: {
    what: "Country or region where the leather itself comes from — only counts when a document ties origin to leather, never a generic country of origin.",
    proof: "Tannery declaration or origin certificate.",
  },
  sole_material: {
    what: "Outsole material as printed (e.g. synthetic rubber, EVA).",
    proof: "Lab report composition claim or sole supplier declaration.",
  },
  reach_compliance: {
    what: "A statement about THIS product respecting REACH (Reg. 1907/2006) — a declaration, certificate, or PASS verdict. A rulebook mention is not compliance.",
    proof: "Supplier REACH declaration or accredited lab PASS report.",
  },
};

export type EmailSignature = { name: string; title: string; company: string; phone: string };

const SIGNATURE_KEY = "tf_email_signature";

export function loadSignature(): EmailSignature {
  if (typeof window === "undefined") return { name: "", title: "", company: "", phone: "" };
  try {
    return { name: "", title: "", company: "", phone: "", ...JSON.parse(localStorage.getItem(SIGNATURE_KEY) || "{}") };
  } catch {
    return { name: "", title: "", company: "", phone: "" };
  }
}

export function saveSignature(sig: EmailSignature) {
  try {
    localStorage.setItem(SIGNATURE_KEY, JSON.stringify(sig));
  } catch {
    // private mode etc: signature simply doesn't persist
  }
}

export function formatSignature(sig: EmailSignature): string {
  const lines = [sig.name, sig.title, sig.company, sig.phone].map((s) => (s || "").trim()).filter(Boolean);
  return lines.join("\n");
}

export function draftSupplierEmail(opts: {
  supplierName: string;
  productName: string;
  productSku: string;
  gaps: { field_key: string; label: string; note: string }[];
  requesterOrg?: string;
  signature?: EmailSignature;
}): { subject: string; body: string } {
  const { supplierName, productName, productSku, gaps, requesterOrg, signature } = opts;
  const subject = `Missing product information — ${productName} (${productSku})`;
  const lines = [
    `Dear ${supplierName} team,`,
    ``,
    `For product ${productName} (SKU ${productSku})${requesterOrg ? `, supplied to ${requesterOrg}` : ""}, we are completing its Digital Product Passport and the following information is still missing or unclear:`,
    ``,
    ...gaps.flatMap((g) => [`• ${g.label}: ${g.note}`]),
    ``,
    `Please reply with the exact value as printed on your documents, and attach the source document it comes from (declaration, certificate, or test report) stating the page or section.`,
    `Where information is genuinely not available, please say so explicitly rather than leaving the item blank.`,
    ``,
    `Thank you,`,
  ];
  const sig = signature ? formatSignature(signature) : "";
  if (sig) lines.push("", sig);
  return { subject, body: lines.join("\n") };
}
