-- Preencher title_short com os primeiros 50 caracteres do title para itens antigos
UPDATE meli_order_items_cache
SET title_short = LEFT(TRIM(title), 50)
WHERE (title_short IS NULL OR title_short = '')
  AND title IS NOT NULL
  AND title != '';