-- DEC-030: each photo keeps its original and a square crop (fractions of the original).
-- Null means centred and as big as fits, which is what existing photos get.
ALTER TABLE `photos` ADD `crop_x` real;--> statement-breakpoint
ALTER TABLE `photos` ADD `crop_y` real;--> statement-breakpoint
ALTER TABLE `photos` ADD `crop_size` real;