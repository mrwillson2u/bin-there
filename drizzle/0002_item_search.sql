-- Full-text search over items. rowid = items.id; rows are rewritten by
-- indexItem() in src/server/items.ts whenever an item changes.
CREATE VIRTUAL TABLE `items_fts` USING fts5(name, category, details, tokenize = 'unicode61 remove_diacritics 2');
