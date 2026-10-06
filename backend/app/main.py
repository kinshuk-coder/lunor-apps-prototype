"""Lunor Apps API. The browser only renders; every AI call happens here."""
import json
import logging
import posixpath
import time
from collections import defaultdict
from typing import AsyncIterator

import openai
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from . import config, db
from .agents import build as build_agent
from .agents import explain as explain_agent
from .agents import learn as learn_agent
from .agents import plan as plan_agent
from .agents import understand as understand_agent
from .agents.fileblocks import Event
from .llm import LLMError
from .schemas import (
    ChallengeCheckRequest, ChangeRequest, CreateProject, ExplainRequest, FilesUpdate, FixRequest,
    PlanOut, PlanRequest, QuizResult,
)
from .template import ALLOWED_PACKAGES, STARTER_FILES, disallowed_imports

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("lunor")

app = FastAPI(title="Lunor Apps API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)
db.init()

# ---------- rate limit: simple per-IP token bucket on AI endpoints ----------
_buckets: dict[str, tuple[float, float]] = defaultdict(lambda: (float(config.RATE_LIMIT_PER_MIN), time.time()))


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    if request.method in ("POST", "PUT"):
        ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0]
        tokens, last = _buckets[ip]
        now = time.time()
        tokens = min(config.RATE_LIMIT_PER_MIN, tokens + (now - last) * config.RATE_LIMIT_PER_MIN / 60)
        if tokens < 1:
            return JSONResponse({"detail": "Too many requests - please wait a moment."}, status_code=429)
        _buckets[ip] = (tokens - 1, now)
    return await call_next(request)


@app.exception_handler(openai.APIError)
async def provider_error(_: Request, exc: openai.APIError):
    log.warning("LLM provider error: %s", exc)
    status = getattr(exc, "status_code", None)
    hint = " Check GROQ_API_KEY." if status == 401 else ""
    return JSONResponse({"detail": f"AI provider error ({status or 'network'}).{hint} {str(exc)[:300]}"}, status_code=502)


@app.exception_handler(LLMError)
async def llm_error(_: Request, exc: LLMError):
    return JSONResponse({"detail": f"The AI returned an unexpected answer. Please try again. ({exc})"}, status_code=502)


# ---------- helpers ----------
def project_or_404(pid: str) -> dict:
    p = db.get_project(pid)
    if p is None:
        raise HTTPException(404, "Project not found")
    return p


def safe_path(path: str) -> str | None:
    """Only relative, normalised .js/.json paths inside the project."""
    p = posixpath.normpath(path.strip().lstrip("/").replace("\\", "/"))
    if p.startswith("..") or not p.endswith((".js", ".json")) or p.endswith("package.json"):
        return None
    return p


async def cached(key_parts: tuple, fn, fresh: bool = False):
    key = db.cache_key(*key_parts)
    hit = None if fresh else db.cache_get(key)
    if hit is not None:
        return hit
    result = (await fn()).model_dump()
    db.cache_put(key, result)
    return result


async def apply_stream(pid: str, events: AsyncIterator[Event], task_id: int | None = None) -> AsyncIterator[dict]:
    """Persist file blocks as they complete and translate them to SSE messages."""
    changed: list[str] = []
    async for ev in events:
        if ev.kind == "text":
            yield {"event": "note", "data": json.dumps({"text": ev.text.strip(), "task_id": task_id})}
        elif ev.kind == "file_start":
            yield {"event": "file_start", "data": json.dumps({"path": ev.path, "task_id": task_id})}
        elif ev.kind == "file_delta":
            yield {"event": "file_delta", "data": json.dumps({"path": ev.path, "text": ev.text})}
        elif ev.kind == "file_end":
            path = safe_path(ev.path)
            if path:
                db.put_file(pid, path, ev.text)
                changed.append(path)
                yield {"event": "file_done", "data": json.dumps({"path": path, "content": ev.text, "task_id": task_id})}
        elif ev.kind == "delete":
            path = safe_path(ev.path)
            if path and path != "App.js":
                db.delete_file(pid, path)
                yield {"event": "file_deleted", "data": json.dumps({"path": path})}


async def enforce_allowlist(pid: str, p: dict, task_id: int | None = None) -> AsyncIterator[dict]:
    """If the model imported a package outside the template's allow-list, ask it once to replace it.

    Snack can't load unlisted packages, so one bad import blanks the whole preview.
    """
    bad = disallowed_imports(db.get_files(pid))
    if not bad:
        return
    found = "; ".join(f"{path} imports {', '.join(pkgs)}" for path, pkgs in bad.items())
    yield {"event": "note", "data": json.dumps({"text": f"Replacing packages that aren't available: {found}", "task_id": task_id})}
    error = (
        f"These imports can't be loaded in this app: {found}. Only these packages are available: "
        f"{', '.join(ALLOWED_PACKAGES)}. Remove the unavailable imports and implement the same behaviour "
        "with what is available (e.g. Vibration from react-native instead of a sound library)."
    )
    async for msg in apply_stream(pid, build_agent.fix(p, db.get_files(pid), error), task_id):
        yield msg


def sse(gen: AsyncIterator[dict]) -> EventSourceResponse:
    async def wrapped():
        try:
            async for msg in gen:
                yield msg
        except Exception as e:  # surface failures to the UI instead of a dropped stream
            log.exception("stream failed")
            yield {"event": "error", "data": json.dumps({"message": str(e)[:500]})}
        yield {"event": "done", "data": "{}"}

    return EventSourceResponse(wrapped(), ping=15)


# ---------- routes ----------
@app.get("/health")
def health():
    return {"ok": True, "strong_model": config.STRONG_MODEL, "fast_model": config.FAST_MODEL,
            "key_configured": bool(config.GROQ_API_KEY), "mistral_key_configured": bool(config.MISTRAL_API_KEY)}


@app.get("/template")
def template():
    return {"files": STARTER_FILES, "packages": ALLOWED_PACKAGES}


@app.post("/projects")
def create_project(body: CreateProject):
    pid = db.create_project(body.idea.strip())
    for path, content in STARTER_FILES.items():
        db.put_file(pid, path, content)
    return {"id": pid}


@app.get("/projects/{pid}")
def get_project(pid: str):
    p = project_or_404(pid)
    p["files"] = db.get_files(pid)
    return p


@app.post("/projects/{pid}/understand")
async def understand(pid: str, fresh: bool = False):
    p = project_or_404(pid)
    result = await cached(("understand", config.FAST_MODEL, p["idea"]), lambda: understand_agent.run(p["idea"]), fresh)
    db.update_project(pid, understand=result)
    return result


@app.post("/projects/{pid}/plan")
async def make_plan(pid: str, body: PlanRequest, fresh: bool = False):
    p = project_or_404(pid)
    if not p.get("understand"):
        raise HTTPException(400, "Run Understand first")
    db.update_project(pid, answers=body.answers)
    p["answers"] = body.answers
    result = await cached(("plan", config.STRONG_MODEL, p["idea"], p["understand"], body.answers),
                          lambda: plan_agent.run(p), fresh)
    db.update_project(pid, plan=result, plan_approved=0, built_task_ids=[])
    return result


@app.put("/projects/{pid}/plan")
def edit_plan(pid: str, body: PlanOut):
    """Save an edited plan. Tasks whose content changed are marked for rebuild."""
    p = project_or_404(pid)
    new = body.model_dump()
    old_tasks = {t["id"]: t for t in (p.get("plan") or {}).get("tasks", [])}
    still_built = [t["id"] for t in new["tasks"] if t["id"] in p["built_task_ids"] and old_tasks.get(t["id"]) == t]
    db.update_project(pid, plan=new, plan_approved=0, built_task_ids=still_built)
    return {"plan": new, "built_task_ids": still_built}


@app.post("/projects/{pid}/plan/approve")
def approve_plan(pid: str):
    p = project_or_404(pid)
    if not p.get("plan"):
        raise HTTPException(400, "No plan to approve")
    db.update_project(pid, plan_approved=1)
    return {"ok": True}


@app.post("/projects/{pid}/build")
async def build(pid: str):
    """Build every approved task not yet built, one at a time, streaming files."""
    p = project_or_404(pid)
    if not p["plan_approved"]:
        raise HTTPException(400, "Approve the plan first")

    async def gen():
        built = list(p["built_task_ids"])
        todo = [t for t in p["plan"]["tasks"] if t["id"] not in built]
        yield {"event": "build_start", "data": json.dumps({"task_ids": [t["id"] for t in todo]})}
        for task in todo:
            yield {"event": "task_start", "data": json.dumps({"task_id": task["id"], "title": task["title"]})}
            files = db.get_files(pid)
            async for msg in apply_stream(pid, build_agent.build_task(p, files, task), task["id"]):
                yield msg
            async for msg in enforce_allowlist(pid, p, task["id"]):
                yield msg
            built.append(task["id"])
            db.update_project(pid, built_task_ids=built)
            yield {"event": "task_done", "data": json.dumps({"task_id": task["id"], "files": db.get_files(pid)})}

    return sse(gen())


@app.post("/projects/{pid}/fix")
async def fix(pid: str, body: FixRequest):
    p = project_or_404(pid)

    async def gen():
        async for msg in apply_stream(pid, build_agent.fix(p, db.get_files(pid), body.error[:4000])):
            yield msg
        async for msg in enforce_allowlist(pid, p):
            yield msg
        yield {"event": "task_done", "data": json.dumps({"task_id": None, "files": db.get_files(pid)})}

    return sse(gen())


@app.post("/projects/{pid}/change")
async def change(pid: str, body: ChangeRequest):
    p = project_or_404(pid)

    async def gen():
        async for msg in apply_stream(pid, build_agent.change(p, db.get_files(pid), body.request[:2000])):
            yield msg
        async for msg in enforce_allowlist(pid, p):
            yield msg
        yield {"event": "task_done", "data": json.dumps({"task_id": None, "files": db.get_files(pid)})}

    return sse(gen())


@app.get("/projects/{pid}/files")
def get_files(pid: str):
    project_or_404(pid)
    return db.get_files(pid)


@app.put("/projects/{pid}/files")
def put_files(pid: str, body: FilesUpdate):
    """Save the learner's own edits (e.g. while doing a challenge)."""
    project_or_404(pid)
    for path, content in body.files.items():
        if (sp := safe_path(path)):
            db.put_file(pid, sp, content)
    return db.get_files(pid)


@app.post("/projects/{pid}/explain")
async def explain(pid: str, body: ExplainRequest):
    p = project_or_404(pid)
    files = db.get_files(pid)
    if body.task_id is None and body.path not in files:
        raise HTTPException(400, "Pick a file or a plan task to explain")
    target = files.get(body.path or "", "")
    return await cached(
        ("explain", config.FAST_MODEL, body.model_dump(), target if body.task_id is None else files, p.get("plan")),
        lambda: explain_agent.run(p, files, body.path, body.start_line, body.end_line, body.task_id),
    )


@app.post("/projects/{pid}/learn")
async def learn(pid: str):
    p = project_or_404(pid)
    files = db.get_files(pid)
    result = await cached(("learn", config.FAST_MODEL, files), lambda: learn_agent.run(p, files))
    db.update_project(pid, learn=result)
    return result


@app.post("/projects/{pid}/quiz")
def quiz(pid: str, body: QuizResult):
    project_or_404(pid)
    db.update_project(pid, quiz=body.model_dump())
    return {"ok": True}


@app.post("/projects/{pid}/challenge/check")
async def check_challenge(pid: str, body: ChallengeCheckRequest):
    p = project_or_404(pid)
    challenges = (p.get("learn") or {}).get("challenges", [])
    if not 0 <= body.challenge_index < len(challenges):
        raise HTTPException(400, "Unknown challenge")
    for path, content in body.files.items():
        if (sp := safe_path(path)):
            db.put_file(pid, sp, content)
    result = await learn_agent.check(challenges[body.challenge_index], db.get_files(pid))
    return result.model_dump()
