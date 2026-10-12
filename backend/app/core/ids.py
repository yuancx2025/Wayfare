import re
import secrets


def new_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(5)}"


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:80] or "place"
