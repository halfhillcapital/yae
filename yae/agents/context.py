from dataclasses import dataclass

from httpx import AsyncClient


@dataclass
class AgentContext:
    http: AsyncClient = AsyncClient()