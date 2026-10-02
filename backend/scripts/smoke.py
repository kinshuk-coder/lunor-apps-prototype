"""Live end-to-end check against Groq: Understand -> Plan -> Build (first 2 tasks).

Usage (from backend/):  .venv/Scripts/python -m scripts.smoke ["your idea"]
Needs GROQ_API_KEY in backend/.env. Prints timings and the generated files.
"""
import asyncio
import sys
import time

from app import config
from app.agents import build, plan, understand
from app.template import STARTER_FILES


sys.stdout.reconfigure(encoding="utf-8")


async def main(idea: str):
    if not config.GROQ_API_KEY:
        sys.exit("GROQ_API_KEY is not set (backend/.env)")
    print(f"strong={config.STRONG_MODEL} fast={config.FAST_MODEL}\nidea: {idea}\n")

    t = time.time()
    u = await understand.run(idea)
    print(f"[understand {time.time() - t:.1f}s] {u.app_name}: {u.summary}")
    for q in u.questions:
        print(f"  ? {q.question} -> {q.suggested_answer}")

    project = {"idea": idea, "understand": u.model_dump(), "answers": []}
    t = time.time()
    p = await plan.run(project)
    project["plan"] = p.model_dump()
    print(f"\n[plan {time.time() - t:.1f}s] screens={[s.name for s in p.screens]}")
    for task in p.tasks:
        print(f"  {task.id}. {task.title}  {task.files}")

    files = dict(STARTER_FILES)
    for task in p.tasks[:2]:
        t = time.time()
        async for ev in build.build_task(project, files, task.model_dump()):
            if ev.kind == "file_end":
                files[ev.path] = ev.text
                print(f"  wrote {ev.path} ({len(ev.text.splitlines())} lines)")
            elif ev.kind == "text":
                print(f"  note: {ev.text.strip()[:120]}")
        print(f"[build task {task.id} {time.time() - t:.1f}s]")

    print("\n--- App.js ---\n" + files["App.js"])


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "a habit tracker for students with streaks"))
