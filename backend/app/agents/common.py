"""Helpers for putting project context into prompts."""
import json


def files_block(files: dict[str, str], numbered: bool = False) -> str:
    parts = []
    for path, content in sorted(files.items()):
        if numbered:
            content = "\n".join(f"{i:>4} | {line}" for i, line in enumerate(content.split("\n"), 1))
        parts.append(f"### {path}\n{content}")
    return "\n\n".join(parts) if parts else "(no files yet)"


def plan_block(plan: dict | None) -> str:
    return json.dumps(plan, indent=1) if plan else "(no plan)"


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
        f"Understanding:\n{json.dumps({k: v for k, v in u.items() if k != 'questions'}, indent=1)}\n\n"
        f"Clarifications:\n{qa or '(none)'}"
    )
