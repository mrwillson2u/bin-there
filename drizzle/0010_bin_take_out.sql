-- DEC-028: a bin can be taken out of its box (to a project kit, or with a note) and
-- keeps its grid spot until it's put back. Nothing changes for existing rows.
ALTER TABLE `locations` ADD `out_at` text;--> statement-breakpoint
ALTER TABLE `locations` ADD `out_to_id` integer REFERENCES locations(id);--> statement-breakpoint
ALTER TABLE `locations` ADD `out_note` text;