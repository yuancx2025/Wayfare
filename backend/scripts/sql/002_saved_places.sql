-- Existing databases after 001 only. Fresh model-initialized databases already have this table.
CREATE TABLE saved_places (
    id varchar(64) PRIMARY KEY,
    user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider varchar(7) NOT NULL,
    kind varchar(11) NOT NULL,
    external_id text NOT NULL,
    external_id_hash varchar(64) NOT NULL,
    created_at timestamptz NOT NULL,
    CONSTRAINT uq_saved_places_owner_reference UNIQUE (user_id, provider, kind, external_id_hash),
    CONSTRAINT ck_saved_places_provider CHECK (provider IN ('catalog', 'google')),
    CONSTRAINT ck_saved_places_kind CHECK (kind IN ('destination', 'place')),
    CONSTRAINT ck_saved_places_external_id CHECK (length(external_id) > 0)
);
CREATE INDEX ix_saved_places_owner_created ON saved_places (user_id, created_at);
