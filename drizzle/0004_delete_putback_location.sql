-- DEC-009: the put-back bin is physical only. Delete the old built-in location
-- (0003 only archived it), unless something somehow refers to it.
DELETE FROM `locations`
WHERE `type` = 'put_back'
  AND NOT EXISTS (SELECT 1 FROM `locations` c WHERE c.`parent_id` = `locations`.`id`)
  AND NOT EXISTS (SELECT 1 FROM `stock` s WHERE s.`location_id` = `locations`.`id`)
  AND NOT EXISTS (SELECT 1 FROM `item_homes` h WHERE h.`location_id` = `locations`.`id`)
  AND NOT EXISTS (SELECT 1 FROM `units` u WHERE u.`location_id` = `locations`.`id` OR u.`home_location_id` = `locations`.`id`)
  AND NOT EXISTS (SELECT 1 FROM `photos` p WHERE p.`location_id` = `locations`.`id`)
  AND NOT EXISTS (
    SELECT 1 FROM `events` e
    WHERE e.`location_id` = `locations`.`id` OR e.`from_location_id` = `locations`.`id` OR e.`to_location_id` = `locations`.`id`
  );
