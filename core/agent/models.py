"""Native OpenAI model construction for configured agents."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
from agents import (
    AgentOutputSchemaBase,
    Handoff,
    Model,
    ModelResponse,
    ModelRetryAdvice,
    ModelRetryAdviceRequest,
    ModelRetryBackoffSettings,
    ModelRetrySettings,
    ModelSettings,
    ModelTracing,
    TResponseInputItem,
    Tool,
    retry_policies,
)
from agents.models.openai_provider import OpenAIProvider
from agents.stream_events import TResponseStreamEvent
from openai import DEFAULT_TIMEOUT, AsyncOpenAI
from openai.types.responses.response_prompt_param import ResponsePromptParam

from config import AgentConfig
from core.agent.model_input import ModelInputAdapter


_MODEL_CONNECT_TIMEOUT_SECONDS = 15.0
_MODEL_REQUEST_MAX_RETRIES = 8
_TRANSIENT_HTTP_STATUSES = (408, 409, 429, *range(500, 600))


def build_model_retry_settings() -> ModelRetrySettings:
    """Build the provider-neutral retry policy used by every Agent model call."""
    return ModelRetrySettings(
        max_retries=_MODEL_REQUEST_MAX_RETRIES,
        backoff=ModelRetryBackoffSettings(
            initial_delay=1.0,
            max_delay=30.0,
            multiplier=2.0,
            jitter=True,
        ),
        policy=retry_policies.any(
            retry_policies.provider_suggested(),
            retry_policies.network_error(),
            retry_policies.retry_after(),
            retry_policies.http_status(_TRANSIENT_HTTP_STATUSES),
        ),
    )


class Z3r0OpenAIModel(Model):
    def __init__(self, cfg: AgentConfig) -> None:
        self.model = cfg.model
        self._input_adapter = ModelInputAdapter()
        self._client = AsyncOpenAI(
            api_key=cfg.api_key or ("unused" if cfg.base_url else None),
            base_url=cfg.base_url or None,
            timeout=httpx.Timeout(
                connect=_MODEL_CONNECT_TIMEOUT_SECONDS,
                read=DEFAULT_TIMEOUT.read,
                write=DEFAULT_TIMEOUT.write,
                pool=DEFAULT_TIMEOUT.pool,
            ),
            # Agent runner retries are replay-aware; do not multiply them with
            # transport retries hidden inside the provider client.
            max_retries=0,
        )
        self._provider = OpenAIProvider(
            openai_client=self._client,
            use_responses=cfg.use_responses,
        )
        self._model = self._provider.get_model(cfg.model)

    def get_retry_advice(self, request: ModelRetryAdviceRequest) -> ModelRetryAdvice | None:
        return self._model.get_retry_advice(request)

    async def get_response(
        self,
        system_instructions: str | None,
        input: str | list[TResponseInputItem],
        model_settings: ModelSettings,
        tools: list[Tool],
        output_schema: AgentOutputSchemaBase | None,
        handoffs: list[Handoff],
        tracing: ModelTracing,
        *,
        previous_response_id: str | None,
        conversation_id: str | None,
        prompt: ResponsePromptParam | None,
    ) -> ModelResponse:
        return await self._model.get_response(
            system_instructions,
            self._input_adapter.adapt(input),
            model_settings,
            tools,
            output_schema,
            handoffs,
            tracing,
            previous_response_id=previous_response_id,
            conversation_id=conversation_id,
            prompt=prompt,
        )

    async def stream_response(
        self,
        system_instructions: str | None,
        input: str | list[TResponseInputItem],
        model_settings: ModelSettings,
        tools: list[Tool],
        output_schema: AgentOutputSchemaBase | None,
        handoffs: list[Handoff],
        tracing: ModelTracing,
        *,
        previous_response_id: str | None,
        conversation_id: str | None,
        prompt: ResponsePromptParam | None,
    ) -> AsyncIterator[TResponseStreamEvent]:
        async for event in self._model.stream_response(
            system_instructions,
            self._input_adapter.adapt(input),
            model_settings,
            tools,
            output_schema,
            handoffs,
            tracing,
            previous_response_id=previous_response_id,
            conversation_id=conversation_id,
            prompt=prompt,
        ):
            yield event

    async def close(self) -> None:
        await self._model.close()
        await self._provider.aclose()
        await self._client.close()


def build_openai_model(cfg: AgentConfig) -> Z3r0OpenAIModel:
    return Z3r0OpenAIModel(cfg)
