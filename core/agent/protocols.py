from typing import Protocol

from agents import Agent

from core.agent.tool_snapshot import AgentToolSnapshot


class SessionAgentGraphProtocol(Protocol):
    def get(self, agent_code: str) -> Agent:
        ...

    async def close(self) -> None:
        ...


class AgentRegistryProtocol(Protocol):
    def bind(self, tool_snapshot: AgentToolSnapshot) -> SessionAgentGraphProtocol:
        ...

    def code_to_name(self) -> dict[str, str]:
        ...
