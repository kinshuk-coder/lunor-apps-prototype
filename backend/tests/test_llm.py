import asyncio
from types import SimpleNamespace

import pytest

from app import llm
from app.schemas import LearnOut, PlanOut, UnderstandOut


def all_objects(node):
    if isinstance(node, dict):
        if node.get("type") == "object":
            yield node
        for v in node.values():
            yield from all_objects(v)
    elif isinstance(node, list):
        for v in node:
            yield from all_objects(v)


@pytest.mark.parametrize("model", [UnderstandOut, PlanOut, LearnOut])
def test_strict_schema_rules(model):
    s = llm.strict_schema(model)
    text = str(s)
    assert "$ref" not in text and "$defs" not in text and "'default'" not in text
    objs = list(all_objects(s))
    assert objs
    for o in objs:
        assert o["additionalProperties"] is False
        assert set(o["required"]) == set(o["properties"])


def test_strict_schema_keeps_fields_named_title():
    s = llm.strict_schema(PlanOut)
    task = s["properties"]["tasks"]["items"]
    assert "title" in task["properties"] and "title" in task["required"]
    assert "title" not in task  # metadata title is still stripped


def fake_client(completions):
    c = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    c.with_options = lambda **_: c
    return c


class FakeCompletions:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        content = self.replies.pop(0)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


def test_json_call_reasks_once_on_invalid(monkeypatch):
    good = UnderstandOut(app_name="A", summary="s", target_users=["u"], features=[], questions=[]).model_dump_json()
    fake = FakeCompletions(['{"app_name": "A"}', good])
    monkeypatch.setattr(llm, "client", lambda: fake_client(fake))
    out = asyncio.run(llm.json_call("openai/gpt-oss-20b", "sys", "user", UnderstandOut))
    assert out.app_name == "A"
    assert len(fake.calls) == 2
    assert "did not validate" in fake.calls[1]["messages"][-1]["content"]
    assert fake.calls[0]["response_format"]["json_schema"]["strict"] is True


def test_json_call_gives_up_after_two(monkeypatch):
    fake = FakeCompletions(["nope", "still nope"])
    monkeypatch.setattr(llm, "client", lambda: fake_client(fake))
    with pytest.raises(llm.LLMError):
        asyncio.run(llm.json_call("qwen/qwen3.8-27b", "sys", "user", UnderstandOut))


def test_model_params():
    assert llm.model_params("qwen/qwen3.8-27b")["extra_body"]["reasoning_format"] == "hidden"
    assert "reasoning_format" not in llm.model_params("openai/gpt-oss-20b")["extra_body"]


@pytest.mark.parametrize("status", [429, 413])
def test_strong_model_falls_back_when_rate_limited(monkeypatch, status):
    import httpx
    import openai

    good = UnderstandOut(app_name="A", summary="s", target_users=[], features=[], questions=[]).model_dump_json()

    class LimitedOnce(FakeCompletions):
        async def create(self, **kwargs):
            self.calls.append(kwargs)
            if kwargs["model"] == llm.config.STRONG_MODEL:
                resp = httpx.Response(status, request=httpx.Request("POST", "http://x"))
                raise openai.APIStatusError("Request too large", response=resp, body=None)
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=good))])

    fake = LimitedOnce([])
    monkeypatch.setattr(llm, "client", lambda: fake_client(fake))
    out = asyncio.run(llm.json_call(llm.config.STRONG_MODEL, "sys", "user", UnderstandOut))
    assert out.app_name == "A"
    assert [c["model"] for c in fake.calls] == [llm.config.STRONG_MODEL, llm.config.STRONG_FALLBACK_MODEL]
