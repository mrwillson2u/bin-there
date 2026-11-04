-- DEC-027: more starter categories (Colin, 2026-11-04): batteries and the common
-- component types, each with its own fields. Only for a database that already has
-- categories (a new one gets them from the seed), and never a second copy of a name
-- that's already there.
INSERT INTO categories (name, default_kind, default_tracking, field_defs)
SELECT 'Batteries', 'consumable', 'exact', '[{"key":"size","label":"Size","type":"text"},{"key":"chemistry","label":"Chemistry","type":"text"},{"key":"voltage","label":"Voltage","type":"text"},{"key":"capacity","label":"Capacity","type":"text"}]'
WHERE EXISTS (SELECT 1 FROM categories) AND NOT EXISTS (SELECT 1 FROM categories WHERE lower(name) = lower('Batteries'));
--> statement-breakpoint
INSERT INTO categories (name, default_kind, default_tracking, field_defs)
SELECT 'Resistors', 'consumable', 'level', '[{"key":"resistance","label":"Resistance","type":"text"},{"key":"tolerance","label":"Tolerance","type":"text"},{"key":"power","label":"Power","type":"text"},{"key":"package","label":"Package","type":"text"}]'
WHERE EXISTS (SELECT 1 FROM categories) AND NOT EXISTS (SELECT 1 FROM categories WHERE lower(name) = lower('Resistors'));
--> statement-breakpoint
INSERT INTO categories (name, default_kind, default_tracking, field_defs)
SELECT 'Capacitors', 'consumable', 'level', '[{"key":"capacitance","label":"Capacitance","type":"text"},{"key":"voltage","label":"Voltage","type":"text"},{"key":"type","label":"Type","type":"text"},{"key":"package","label":"Package","type":"text"}]'
WHERE EXISTS (SELECT 1 FROM categories) AND NOT EXISTS (SELECT 1 FROM categories WHERE lower(name) = lower('Capacitors'));
--> statement-breakpoint
INSERT INTO categories (name, default_kind, default_tracking, field_defs)
SELECT 'Inductors', 'consumable', 'exact', '[{"key":"inductance","label":"Inductance","type":"text"},{"key":"current","label":"Current","type":"text"},{"key":"package","label":"Package","type":"text"}]'
WHERE EXISTS (SELECT 1 FROM categories) AND NOT EXISTS (SELECT 1 FROM categories WHERE lower(name) = lower('Inductors'));
--> statement-breakpoint
INSERT INTO categories (name, default_kind, default_tracking, field_defs)
SELECT 'Diodes', 'consumable', 'level', '[{"key":"part_number","label":"Part number","type":"text"},{"key":"type","label":"Type","type":"text"},{"key":"package","label":"Package","type":"text"}]'
WHERE EXISTS (SELECT 1 FROM categories) AND NOT EXISTS (SELECT 1 FROM categories WHERE lower(name) = lower('Diodes'));
--> statement-breakpoint
INSERT INTO categories (name, default_kind, default_tracking, field_defs)
SELECT 'LEDs', 'consumable', 'level', '[{"key":"color","label":"Color","type":"text"},{"key":"size","label":"Size","type":"text"},{"key":"package","label":"Package","type":"text"}]'
WHERE EXISTS (SELECT 1 FROM categories) AND NOT EXISTS (SELECT 1 FROM categories WHERE lower(name) = lower('LEDs'));
--> statement-breakpoint
INSERT INTO categories (name, default_kind, default_tracking, field_defs)
SELECT 'Transistors', 'consumable', 'exact', '[{"key":"part_number","label":"Part number","type":"text"},{"key":"type","label":"Type","type":"text"},{"key":"package","label":"Package","type":"text"}]'
WHERE EXISTS (SELECT 1 FROM categories) AND NOT EXISTS (SELECT 1 FROM categories WHERE lower(name) = lower('Transistors'));
--> statement-breakpoint
INSERT INTO categories (name, default_kind, default_tracking, field_defs)
SELECT 'ICs', 'consumable', 'exact', '[{"key":"part_number","label":"Part number","type":"text"},{"key":"function","label":"Function","type":"text"},{"key":"package","label":"Package","type":"text"}]'
WHERE EXISTS (SELECT 1 FROM categories) AND NOT EXISTS (SELECT 1 FROM categories WHERE lower(name) = lower('ICs'));
--> statement-breakpoint
INSERT INTO categories (name, default_kind, default_tracking, field_defs)
SELECT 'Switches & buttons', 'consumable', 'exact', '[{"key":"type","label":"Type","type":"text"},{"key":"rating","label":"Rating","type":"text"},{"key":"mounting","label":"Mounting","type":"text"}]'
WHERE EXISTS (SELECT 1 FROM categories) AND NOT EXISTS (SELECT 1 FROM categories WHERE lower(name) = lower('Switches & buttons'));
