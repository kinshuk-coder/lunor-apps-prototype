# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Lunor Apps is a prototype that turns an app idea into a running React Native (Expo) app shown in a phone frame in the browser. It also teaches the user the code. One idea moves through stages: Prompt → Understand → Plan → Build → Explain → Learn.

- **Brief and schedule:** `AI App-Dev Prototype Plan & Architecture.md` (due 6 Oct 2026).
- **Setup and deploy:** `README.md`.

The project has two apps:
- `backend/`: FastAPI. Every LLM call happens here.
- `frontend/`: Next.js 16 App Router, Tailwind v4 and Monaco. It only renders.

## Commands

The backend venv was made with `uv` on Python 3.12 at `backend/.venv/Scripts/python.exe`. Do not use the msys `python` on PATH: it can't build wheels such as `jiter`.

```bash
# backend (run from backend/)
.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000       # dev server
.venv/Scripts/python.exe -m pytest -q                               # all tests (no API key needed)
.venv/Scripts/python.exe -m pytest -q tests/test_fileblocks.py::test_fences_are_stripped   # single test
.venv/Scripts/python.exe -m scripts.smoke ["idea"]                  # live run (Groq + Mistral): Understand -> Plan -> Build 2 tasks

# frontend (run from frontend/)
npm run dev            # http://localhost:3000, expects NEXT_PUBLIC_API_URL (see .env.example)
npx tsc --noEmit       # typecheck
npx eslint app components lib
npm run build
```

Windows gotchas:
- **Avoid `uvicorn --reload` here.** On restart it left an orphaned worker still listening on :8000 that served stale config. Restart the server by killing whatever listens on 8000.
- **Use UTF-8 output.** Set `PYTHONIOENCODING=utf-8` when printing model output to the console; LLM text often contains non-ASCII characters.
- **Next.js 16 differs from older versions.** Read `frontend/AGENTS.md`, and consult `node_modules/next/dist/docs/` before using unfamiliar Next APIs.

## LLM layer (`backend/app/llm.py`, `config.py`)

- **Clients.** The OpenAI Python SDK talks to two providers. `llm.client(model)` picks one by model name (`is_mistral_model`): Mistral (`MISTRAL_BASE_URL`, `MISTRAL_API_KEY`) for Codestral, Groq (`LLM_BASE_URL`, `GROQ_API_KEY`) for everything else. Mistral takes `max_tokens` and Groq `max_completion_tokens` (`token_limit`).
- **Model names.** They appear only in `config.py`, and each can be overridden by env var:

  | Setting | Default | Used for |
  |---|---|---|
  | `STRONG_MODEL` | `codestral-latest` (Mistral) | Plan, Build, fix, change, challenge check |
  | `FAST_MODEL` | `openai/gpt-oss-20b` | Understand, Explain, Learn |
  | `STRONG_FALLBACK_MODEL` | `openai/gpt-oss-120b` | Strong-model calls that get rate-limited |

- **Loading `.env`.** `config.py` loads `backend/.env` by explicit path with `override=True`.
- **`json_call`** (non-streamed stages):
  - Sends **strict `json_schema`** structured output.
  - The schema comes from the Pydantic model via `strict_schema()`, which inlines `$ref`s, marks every property required, sets `additionalProperties: false`, and strips metadata keys. It must not strip *field names* such as `title`; a regression test covers this.
  - Validates the reply with Pydantic and re-asks once on failure. A provider 400 (e.g. Groq `json_validate_failed`) is also re-asked.
- **`stream_call`** (plain-text streaming). Structured outputs **can't be streamed**, so the Build, fix and change stages stream text instead.
- **`create()` fallback.**
  - Calls to `STRONG_MODEL` are sent with no SDK retries. A 429 or 413 immediately retries the call on `STRONG_FALLBACK_MODEL` (Groq).
  - Other models use the SDK's normal retry with backoff.
  - Background: Groq's free tier allows about 8K tokens per minute per model, too small for Build prompts, which is why the strong model is Codestral (256K context).
- **Reasoning settings** (`model_params`):
  - Qwen (if used) gets `reasoning_format="hidden"`. Codestral gets nothing (Mistral rejects unknown fields).
  - gpt-oss gets `reasoning_effort="low"` and `include_reasoning=False`; gpt-oss rejects `reasoning_format`.

## Pipeline and data flow

- **Agents** (`backend/app/agents/`):
  - `understand.py` and `plan.py` return Pydantic models from `schemas.py`.
  - The project dict stored in SQLite (`db.py`, JSON columns) carries each stage's output to the next.
  - `common.py` formats the plan, spec and files into prompt context.
- **Prompts and template.**
  - System prompts are `backend/app/prompts/*.md`, re-read from disk on every call.
  - Prompts containing `{template_rules}` get `TEMPLATE_RULES` from `template.py` substituted in.
  - `template.py` holds the fixed Expo template, the package allow-list and the starter `App.js`. Rules there apply to every generated app, so put fixes for recurring generated-code bugs there. One example already in it: never set a header option both in App.js and through `navigation.setOptions`.
  - `template.py` is Python, so changing it needs a server restart.
  - **Package allow-list enforcement.** After each Build task, fix and change, `main.py:enforce_allowlist` runs `template.disallowed_imports()` over all files. If anything imports a package outside `ALLOWED_PACKAGES`, it streams one fix pass telling the model to replace it. Snack can't load unlisted packages, and one bad import (e.g. `expo-av`) blanks the whole preview.
- **Build, fix and change streaming:**
  1. The model emits `<<<FILE path>>> … <<<END>>>` and `<<<DELETE path>>>` blocks.
  2. `agents/fileblocks.py:FileBlockParser` parses them incrementally. It handles markers split across chunks, emits commentary as whole lines, and strips stray markdown fences.
  3. `main.py:apply_stream` saves each finished file through `safe_path()` (relative `.js`/`.json` only, no `package.json`).
  4. It then emits SSE events: `note`, `file_start`, `file_delta`, `file_done`, `file_deleted`, `task_done` (with all files), `error`, `done`.
- **Rebuilding after plan edits.** `built_task_ids` tracks which plan tasks are built. `PUT /projects/{id}/plan` keeps only tasks whose content is unchanged, so the next `/build` rebuilds just the edited ones.
- **Caching.** Understand, Plan, Explain and Learn results are cached in the SQLite `cache` table, keyed on stage, model and inputs. Passing `?fresh=1` to `/understand` or `/plan` bypasses the cache.

## Frontend

- **`app/project/[id]/page.tsx`** holds all project state and orchestration:
  - Stage navigation, and SSE handling through `lib/api.ts:streamSSE`. It reads SSE with fetch because streaming endpoints are POST.
  - `file_delta` text is buffered in a ref and flushed every ~60ms. The models stream fast enough that calling setState per token causes "Maximum update depth exceeded".
  - The auto-fix loop (see the preview item below).
- **Two file states:**
  - `files` is the live editor content, including partially streamed files.
  - `previewFiles` is pushed to the phone only on `task_done` or on debounced user edits, so half-written files never reach the preview.
- **`components/PhonePreview.tsx`** uses `snack-sdk`:
  - It creates a `Snack` once (client-only dynamic import) with `webPreviewRef` wired to the iframe.
  - **Self-hosted runtime.** Expo's hosted Snack web runtime (`snack-runtime.eascdn.net`) only accepts `snack.expo.dev`, a few partner sites and `http://localhost:*` as the parent page, so on any deployed domain the preview hangs on "Connecting". `scripts/fetch-snack-runtime.mjs` (run by `predev`/`prebuild`) downloads the runtime's `index.html` and bundle into `public/v2/<sdk>/` (git-ignored) and patches its origin check to also accept its own host. `next.config.ts` rewrites every other `/v2/*` file to Expo's CDN. `PhonePreview` passes `webPlayerURL: ${origin}/v2/%%SDK_VERSION%%`. To test locally, use `http://127.0.0.1:3000`: `localhost` is always allowed, so it can't prove the patch.
  - It infers dependencies from import statements and filters them by the allow-list. These must stay in sync with `ALLOWED_PACKAGES` in `backend/app/template.py`.
  - It pins `"*"` versions to `wantedDependencyVersions` and adds `missingDependencies`.
  - It reports runtime errors from errored `connectedClients` and from `error` logs.
  - **Auto-fix:** reported errors trigger `/fix` (max 2 attempts) only when the last code change came from the AI (`aiChange` ref). User edits in the Learn stage don't trigger it.
- **Shared workspace.** Build, Explain and Learn share one workspace layout (stage sidebar, file tree, Monaco editor, phone), so the Snack stays mounted while switching between those tabs. The editor is editable only in Learn.
- **Lint rules.** ESLint runs the React Compiler rules: no ref writes during render and no synchronous setState in effects. `PlanStage` is reset by remounting it via `key={planVersion}` rather than by an effect.
