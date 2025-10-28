from fastapi import Depends
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.providers.openrouter import OpenRouterProvider

from yae import get_config
from yae.config import AppConfig
from yae.agents.tools import search_tool
from yae.agents.context import YaeContext

class AgentFactory:
    @staticmethod
    def create_chat_agent(config: AppConfig = Depends(get_config)) -> Agent:
        model = OpenAIChatModel(model_name=config.LOCAL_TAG, provider=OpenAIProvider(base_url=config.LOCAL_URL))
        instruct = "You are talking to a human via text chat. Answer in plain text and use markdown formatting."
        return Agent(model, deps_type=YaeContext, instructions=instruct, tools=[search_tool])
    
    @staticmethod
    def create_voice_agent(config: AppConfig = Depends(get_config)) -> Agent:
        model = OpenAIChatModel(model_name=config.REMOTE_TAG, provider=OpenRouterProvider(api_key=config.OPENROUTER_API))
        instruct = """
            You are talking to a human via voice interface. Answer in plain text like you would in a verbal conversation
            (e.g. don't use bullet points, tables or emojis) and keep your answers short and to the point, as the user will
            hear them spoken aloud."""
        return Agent(model, deps_type=YaeContext, instructions=instruct)