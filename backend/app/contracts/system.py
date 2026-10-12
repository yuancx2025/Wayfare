from typing import Literal

from app.contracts.base import ApiModel


class Capabilities(ApiModel):
    status: Literal["ok"] = "ok"
    google: bool
    llm: bool
    agent: bool
