# Database upgrades

Fresh databases use `python -m app.bootstrap.db init --seed` and already include
the current model columns. Do not apply legacy upgrades to a fresh database.

`001_trip_collection_metadata.sql` upgrades an existing pre-collections `trips`
table without deleting rows or modifying itinerary versions. It adds two
non-null booleans with false defaults for existing and future trips.

Before applying an upgrade, confirm the target database and compare its schema
with the authentication owner's account baseline. Apply each applicable script
once, in order, using `psql --single-transaction --set ON_ERROR_STOP=1 --file ...`
against that explicitly selected database. Do not reset a shared database or
silently ignore already existing columns. This branch does not automatically
upgrade any configured database during application startup.
