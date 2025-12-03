from typing import AsyncGenerator

from fastapi import Depends
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.providers.openrouter import OpenRouterProvider
from pydantic_ai import ModelMessage, ModelRequest, ModelResponse, TextPart, UserPromptPart

from yae import get_config
from yae.config import AppConfig
from yae.agents.tools import search_tool
from yae.database.models import Message, Role

from .context import AgentContext


class AgentService:
    def __init__(self, config: AppConfig) -> None:
        self.context = AgentContext()
        self.text_instructions = """You operate within a multi-user chat environment. Users will speak in the format 'Name: Message'.
        You are talking via text chat. Answer in plain text and use markdown formatting."""
        self.voice_instructions = """You operate within a multi-user chat environment. Users will speak in the format 'Name: Message'.
        You are talking via voice interface. Answer in plain text like you would in a verbal conversation (e.g. don't use bullet points, tables or emojis) 
        and keep your answers short and to the point, as the users will hear them spoken aloud."""

        self.system_prompt = config.PERSONA + "\n\n" + self.text_instructions.lstrip() + "\n\n" + config.RULES
        self.voice_prompt = config.PERSONA + "\n\n" + self.voice_instructions.lstrip() + "\n\n" + config.RULES

        provider = OpenRouterProvider(api_key=config.OPENROUTER_API)
        model = OpenAIChatModel(model_name=config.REMOTE_TAG, provider=provider)

        voice_provider = OpenAIProvider(config.LOCAL_URL)
        voice_model = OpenAIChatModel(model_name=config.LOCAL_TAG, provider=voice_provider)
        
        self.agent = Agent(voice_model, instructions=self.system_prompt, deps_type=AgentContext, tools=[search_tool])
        self.voice_agent = Agent(voice_model, instructions=self.voice_prompt)

    async def run_text_agent(self, prompt: Message, history: list[Message]) -> AsyncGenerator[str, None]:
        async with self.agent.run_stream(self._toPrompt(prompt), message_history=self._toPydanticAI(history), deps=self.context) as result:
            async for partial in result.stream_text(delta=True):
                yield partial

    async def run_voice_agent(self, prompt: Message, history: list[Message]) -> AsyncGenerator[str, None]:
        async with self.voice_agent.run_stream(self._toPrompt(prompt), message_history=self._toPydanticAI(history)) as result:
            async for partial in result.stream_text(delta=True):
                yield partial

    async def shutdown(self):
        await self.context.http.aclose()

    def _toPrompt(self, message: Message) -> str:
        return f"{message.user.name}: {message.content}"

    def _toPydanticAI(self, messages: list[Message]) -> list[ModelMessage]:
        converted: list[ModelMessage] = []
        for message in messages:
            if message.user.role == Role.ASSISTANT:
                converted.append(ModelResponse(
                    parts=[TextPart(content=message.content)],
                    timestamp=message.created_at))
            else:
                converted.append(ModelRequest(
                    parts=[UserPromptPart(content=self._toPrompt(message), timestamp=message.created_at)]
                ))
        return converted

_agent_service : AgentService | None = None

def get_agent_service(config: AppConfig = Depends(get_config)) -> AgentService:
    global _agent_service
    if _agent_service is None:
        _agent_service = AgentService(config)
    return _agent_service