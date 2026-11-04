-- DEC-023: bin IDs are unique across the whole system, not per box, so a bin keeps
-- its identity when it moves to another box, and fixed-width (Bin 0001) so they read
-- as IDs, not positions. Bins named "Bin <number>" (the automatic names) are given
-- 0001, 0002, ... in the order they were created. Any other name is left alone.
UPDATE locations
SET name = 'Bin ' || printf('%04d', (
  SELECT n FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS n
    FROM locations
    WHERE type = 'bin' AND name GLOB 'Bin [0-9]*' AND name NOT GLOB 'Bin *[^0-9]*'
  ) AS numbered
  WHERE numbered.id = locations.id
))
WHERE type = 'bin' AND name GLOB 'Bin [0-9]*' AND name NOT GLOB 'Bin *[^0-9]*';
