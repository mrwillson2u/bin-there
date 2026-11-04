-- DEC-034: racks and shelves have numbered positions (rack_size), with optional labels
-- (rack_labels), and each place inside one sits in a position (rack_slot, 0-based).
ALTER TABLE `locations` ADD `rack_size` integer;--> statement-breakpoint
ALTER TABLE `locations` ADD `rack_labels` text;--> statement-breakpoint
ALTER TABLE `locations` ADD `rack_slot` integer;--> statement-breakpoint
-- Carry over DEC-033's typed positions: a whole number n puts the place in position n.
-- Anything else typed there (none in the live data) leaves the place "not in a position".
UPDATE `locations` SET `rack_slot` = CAST(`position` AS INTEGER) - 1
WHERE `position` IS NOT NULL AND `position` <> '' AND `position` NOT GLOB '*[^0-9]*'
  AND CAST(`position` AS INTEGER) BETWEEN 1 AND 200;--> statement-breakpoint
-- A place that got positions that way is as big as its highest one.
UPDATE `locations` SET `rack_size` = (SELECT MAX(c.`rack_slot`) + 1 FROM `locations` c WHERE c.`parent_id` = `locations`.`id`)
WHERE `id` IN (SELECT `parent_id` FROM `locations` WHERE `rack_slot` IS NOT NULL);
