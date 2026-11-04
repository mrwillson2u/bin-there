-- DEC-031: which photo is shown for an item. None marked means the oldest, as before.
ALTER TABLE `photos` ADD `is_main` integer DEFAULT false NOT NULL;