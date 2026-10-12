"""Create tables from the ORM models in an empty PostgreSQL database.

    uv run python -m app.bootstrap.db init
    uv run python -m app.bootstrap.db init --seed
"""

import argparse
import asyncio

from sqlalchemy import inspect

from app.db.registry import Base
from app.db.session import create_tables, dispose_engine, get_engine


def _existing_app_tables(sync_conn) -> list[str]:
    present = set(inspect(sync_conn).get_table_names())
    return sorted(set(Base.metadata.tables) & present)


async def initialize(*, seed: bool) -> None:
    engine = get_engine()
    if engine.dialect.name != "postgresql":
        raise SystemExit("init requires a PostgreSQL DATABASE_URL.")
    async with engine.connect() as conn:
        existing = await conn.run_sync(_existing_app_tables)
    if existing:
        names = ", ".join(existing)
        raise SystemExit(
            f"Database already has application tables ({names}). "
            "create_all() does not alter existing tables. "
            "Point DATABASE_URL at a new empty Neon database and run init again."
        )
    await create_tables()
    print("Created application tables.")
    if seed:
        from app.bootstrap.seed import seed_catalog
        from app.db.session import get_sessionmaker

        async with get_sessionmaker()() as session:
            await seed_catalog(session)
        print("Seeded catalog destinations.")
    await dispose_engine()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.bootstrap.db")
    sub = parser.add_subparsers(dest="command", required=True)
    init = sub.add_parser("init", help="Create tables in an empty PostgreSQL database")
    init.add_argument("--seed", action="store_true", help="Insert curated catalog destinations")
    args = parser.parse_args(argv)
    if args.command == "init":
        asyncio.run(initialize(seed=args.seed))


if __name__ == "__main__":
    main()
