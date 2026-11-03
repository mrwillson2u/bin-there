-- The put-back bin is physical only (DEC-009): hide the location the app used to create for it.
-- Archived rather than deleted so old activity-log entries still resolve.
UPDATE `locations` SET `archived` = 1 WHERE `type` = 'put_back';
