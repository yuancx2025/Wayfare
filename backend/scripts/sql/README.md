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

`002_saved_places.sql` adds independent saved references after upgrade 001. It
does not copy provider responses or link saved places to trips. The user foreign
key cascades on account deletion; deleting a trip leaves saved references intact.
The unique key includes owner, provider, kind and a SHA-256 digest of the exact
external ID. The original ID is retained as text and checked on a deduplication
hit, so long opaque IDs do not overflow a btree index or silently collide.

Integration with `main@7e23d1b`: Clerk identities map to the existing internal
`users.id`, so both collection upgrades retain their original foreign keys.
The upgrade tests run against the Clerk-enabled user model and preserve existing
users and trips. These scripts do not provision or migrate authentication fields;
an older pre-Clerk database must first follow the authentication owner's migration
path. No development or shared database is upgraded as part of a branch merge.
