"""OpenAI SDK pointed at Groq.

Two entry points:
- json_call: non-streamed, strict json_schema structured output, validated by
  Pydantic, with one re-ask carrying the validation error.
- stream_call: plain-text streaming (Groq can't stream structured outputs).
"""
import copy
import json
import logging
from typing import AsyncIterator, TypeVar

import openai
from openai import AsyncOpenAI
from pydantic import BaseModel, ValidationError

from . import config

log = logging.getLogger("lunor.llm")
T = TypeVar("T", bound=BaseModel)

_client: AsyncOpenAI | None = None


def client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=config.GROQ_API_KEY or "missing", base_url=config.LLM_BASE_URL, max_retries=config.LLM_MAX_RETRIES
        )
    return _client


def model_params(model: str) -> dict:
    """Per-family reasoning knobs so thinking tokens never leak into output."""
    if model.startswith("qwen/"):
        return {"extra_body": {"reasoning_format": "hidden"}}
    if model.startswith("openai/gpt-oss"):
        return {"extra_body": {"reasoning_effort": "low", "include_reasoning": False}}
    return {}


def max_tokens_for(model: str) -> int:
    return config.FAST_MAX_TOKENS if model == config.FAST_MODEL else config.STRONG_MAX_TOKENS


async def create(model: str, **kwargs):
    """chat.completions.create with a per-model fallback when rate-limited.

    Groq rate limits are per model, so if the strong model is out of tokens
    (or the request exceeds its per-minute output cap) we retry on the fallback.
    """
    fallback = config.STRONG_FALLBACK_MODEL
    can_fall_back = model == config.STRONG_MODEL and fallback and fallback != model
    # With a fallback available, fail fast instead of sitting in SDK backoff.
    c = client().with_options(max_retries=0) if can_fall_back else client()
    try:
        return await c.chat.completions.create(
            model=model, max_completion_tokens=max_tokens_for(model), **model_params(model), **kwargs
        )
    except openai.RateLimitError as e:
        if not can_fall_back:
            raise
        log.warning("%s rate-limited, falling back to %s: %s", model, fallback, str(e)[:200])
        return await client().chat.completions.create(
            model=fallback, max_completion_tokens=max_tokens_for(fallback), **model_params(fallback), **kwargs
        )


def strict_schema(model: type[BaseModel]) -> dict:
    """Pydantic JSON schema -> strict-mode schema.

    Strict mode needs: every property required, additionalProperties false on
    every object, no defaults/titles. $refs are inlined to keep it portable.
    """
    raw = model.model_json_schema()
    defs = raw.pop("$defs", {})

    def walk(node, is_properties: bool = False):
        if isinstance(node, dict):
            if "$ref" in node and not is_properties:
                name = node["$ref"].split("/")[-1]
                return walk(copy.deepcopy(defs[name]))
            out = {}
            for k, v in node.items():
                # Inside "properties" the keys are field names (a field may be called "title").
                if not is_properties and k in ("title", "default", "examples"):
                    continue
                out[k] = walk(v, is_properties=(k == "properties" and not is_properties))
            if out.get("type") == "object" and "properties" in out:
                out["required"] = list(out["properties"].keys())
                out["additionalProperties"] = False
            return out
        if isinstance(node, list):
            return [walk(x) for x in node]
        return node

    return walk(raw)


async def json_call(model: str, system: str, user: str, schema: type[T], temperature: float = 0.4) -> T:
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    response_format = {
        "type": "json_schema",
        "json_schema": {"name": schema.__name__, "strict": True, "schema": strict_schema(schema)},
    }
    last_error = ""
    for attempt in range(2):
        try:
            resp = await create(model, messages=messages, response_format=response_format, temperature=temperature)
            text = resp.choices[0].message.content or ""
            return schema.model_validate_json(text)
        except (ValidationError, json.JSONDecodeError) as e:
            last_error = str(e)
            messages = messages + [
                {"role": "assistant", "content": text},
                {"role": "user", "content": f"Your JSON did not validate:\n{last_error}\nReturn corrected JSON only."},
            ]
        except openai.BadRequestError as e:
            # Groq returns 400 json_validate_failed when the model breaks the schema.
            last_error = str(e)
            messages = messages + [
                {"role": "user", "content": f"The previous attempt failed schema validation: {last_error[:500]}. Return valid JSON that matches the schema exactly."},
            ]
        log.warning("json_call attempt %d failed for %s: %s", attempt + 1, schema.__name__, last_error[:300])
    raise LLMError(f"{schema.__name__} output invalid after retry: {last_error[:500]}")


async def stream_call(model: str, system: str, messages: list[dict], temperature: float = 0.2) -> AsyncIterator[str]:
    stream = await create(
        model, messages=[{"role": "system", "content": system}, *messages], temperature=temperature, stream=True
    )
    async for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


class LLMError(RuntimeError):
    pass
