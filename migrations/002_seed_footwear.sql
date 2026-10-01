-- Seed field_definitions for category 'footwear' (spec section 3)

INSERT INTO field_definitions (category, field_key, label, required, display_order) VALUES
  ('footwear', 'product_name',      'Product name',      TRUE, 1),
  ('footwear', 'sku',               'SKU',               TRUE, 2),
  ('footwear', 'upper_material',    'Upper material',    TRUE, 3),
  ('footwear', 'upper_composition', 'Upper composition', TRUE, 4),
  ('footwear', 'leather_origin',    'Leather origin',    TRUE, 5),
  ('footwear', 'sole_material',     'Sole material',     TRUE, 6),
  ('footwear', 'reach_compliance',  'REACH compliance',  TRUE, 7)
ON CONFLICT (category, field_key) DO NOTHING;
