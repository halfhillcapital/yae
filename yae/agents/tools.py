import httpx
from pydantic import BaseModel, ValidationError
from pydantic_ai import RunContext

import yae.utils as utils
from yae.agents.context import YaeContext


class SearchSource(BaseModel):
    name: str
    snippet: str
    url: str


class SearchResult(BaseModel):
    answer: str
    sources: list[SearchSource]


async def search_tool(ctx: RunContext[YaeContext], query: str) -> str:
    """A powerful web search tool that provides comprehensive, real-time results using LinkUp's AI search engine.
    Returns relevant web content with customizable parameters for result count, content type, and domain filtering.
    Ideal for gathering current information, news, and detailed web content analysis.

    Args:
        query: The search query.
    """

    try:
        url = utils.required_env("LINKUP_URL")
        key = utils.required_env("LINKUP_API_KEY")
    except utils.MissingEnvironmentVariableError:
        return "There is a problem with the configuration of the search tool."
    
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    body = {
        "q": query,
        "depth": "standard",
        "outputType": "sourcedAnswer",
        "includeImages": "false",
        "includeInlineCitations": "false",
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=body, headers=headers, timeout=20.0)

    if response.status_code != 200:
        print(f"Search tool error: {response.status_code}: {response.text}")
        return "There is a problem with the search tool."

    try:
        data = SearchResult.model_validate(response.json())
        return data.answer
    except ValidationError as e:
        print(f"Search tool validation error: {e}")
        return "The response from the search tool could not be validated."


async def message_tool(ctx: RunContext[YaeContext], user_id: str, content: str) -> str:
    return "Not implemented"


async def voice_tool(ctx: RunContext[YaeContext], channel_id: str) -> str:
    return "Not implemented"
