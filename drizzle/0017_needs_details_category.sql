-- DEC-037 (Q47): a part needs a name and a category to be off the Needs details list. Parts that
-- left it with only a name, under the old rule, go back on so the Fill in details page shows them.
UPDATE `items` SET `needs_details` = 1 WHERE `category_id` IS NULL AND `needs_details` = 0 AND `archived` = 0;
