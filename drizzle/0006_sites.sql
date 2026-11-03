-- Sites (Garage, basement, office…) are the new top level. Anything already at the
-- top level moves into a "Garage" site.
INSERT INTO `locations` (`type`, `name`)
SELECT 'site', 'Garage'
WHERE EXISTS (SELECT 1 FROM `locations` WHERE `parent_id` IS NULL AND `type` <> 'site');
--> statement-breakpoint
UPDATE `locations`
SET `parent_id` = (SELECT max(`id`) FROM `locations` WHERE `type` = 'site')
WHERE `parent_id` IS NULL AND `type` <> 'site';
