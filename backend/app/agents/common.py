"""Helpers for putting project context into prompts."""
import json
import re

# Above this many characters of source (~4K tokens), files outside the task's
# focus are sent as outlines. Groq's free tier caps a request at ~7-8K tokens.
FULL_CONTEXT_CHARS = 16000

_OUTLINE_LINE = re.compile(
    r"^(import |export |(async )?function |const \w+ = (\(|async|React\.|create|\{)|class )"
)


def outline(content: str) -> str:
    """Top-level imports/exports/declarations only: enough to wire code against a file."""
    lines = [line for line in content.split("\n") if _OUTLINE_LINE.match(line)]
    return "\n".join(lines) or "(no top-level declarations)"


def files_block(files: dict[str, str], numbered: bool = False, focus: set[str] | None = None) -> str:
    """All files in full, or - when they're large - full only for `focus`, outlines for the rest."""
    compact = focus is not None and sum(len(c) for c in files.values()) > FULL_CONTEXT_CHARS
    parts = []
    for path, content in sorted(files.items()):
        if compact and path not in focus:
            parts.append(f"### {path} (outline only - imports, exports and top-level declarations)\n{outline(content)}")
            continue
        if numbered:
            content = "\n".join(f"{i:>4} | {line}" for i, line in enumerate(content.split("\n"), 1))
        parts.append(f"### {path}\n{content}")
    return "\n\n".join(parts) if parts else "(no files yet)"


def mentioned_files(files: dict[str, str], text: str) -> set[str]:
    """Files whose path or basename appears in some text (an error message, a request)."""
    return {p for p in files if p in text or p.rsplit("/", 1)[-1].removesuffix(".js") in text}


def plan_block(plan: dict | None) -> str:
    return json.dumps(plan, separators=(",", ":")) if plan else "(no plan)"


def spec_block(project: dict) -> str:
    u = project.get("understand") or {}
    questions = u.get("questions", [])
    answers = project.get("answers") or []
    qa = "\n".join(
        f"- Q: {q['question']}\n  A: {answers[i] if i < len(answers) and answers[i] else q['suggested_answer']}"
        for i, q in enumerate(questions)
    )
    return (
        f"Original idea: {project['idea']}\n\n"
        f"Understanding:\n{json.dumps({k: v for k, v in u.items() if k != 'questions'}, separators=(',', ':'))}\n\n"
        f"Clarifications:\n{qa or '(none)'}"
    )
