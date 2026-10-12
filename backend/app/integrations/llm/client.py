"""LangChain chat-model setup. Feature prompts and structured-output schemas live in their features."""

from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel

from app.core.config import Settings


def get_chat_model(settings: Settings) -> BaseChatModel | None:
    if not settings.llm_model:
        return None
    return init_chat_model(settings.llm_model, temperature=settings.llm_temperature)


def supports_tools(llm: BaseChatModel | None) -> bool:
    if llm is None:
        return False
    try:
        llm.bind_tools([])
        return True
    except NotImplementedError:
        return False
