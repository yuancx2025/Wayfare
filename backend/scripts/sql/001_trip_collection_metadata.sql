-- Existing pre-collections databases only. Fresh databases already contain these columns.
-- Apply once in a reviewed transaction; startup never runs this upgrade automatically.
ALTER TABLE trips
    ADD COLUMN is_favorite boolean NOT NULL DEFAULT false,
    ADD COLUMN visited boolean NOT NULL DEFAULT false;
