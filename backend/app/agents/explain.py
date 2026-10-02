from .. import config, llm
from ..schemas import ExplainOut
from ..template import prompt
from .common import files_block, plan_block


async def run(project: dict, files: dict[str, str], path: str | None, start: int | None, end: int | None,
              task_id: int | None) -> ExplainOut:
    plan = project.get("plan")
    if task_id is not None:
        task = next((t for t in (plan or {}).get("tasks", []) if t["id"] == task_id), None)
        task_files = {p: files[p] for p in (task or {}).get("files", []) if p in files}
        target = (
            f"Explain plan task {task_id}: {task}\n\n"
            "Explain what this task built, using the files it produced below. "
            "line_refs refer to the first file listed.\n\n"
            f"{files_block(task_files or files, numbered=True)}"
        )
    else:
        content = files.get(path or "", "")
        lines = content.split("\n")
        s = max(1, start or 1)
        e = min(len(lines), end or len(lines))
        selection = "\n".join(f"{i:>4} | {lines[i - 1]}" for i in range(s, e + 1))
        target = (
            f"Explain lines {s}-{e} of {path}:\n{selection}\n\n"
            f"Full file for context:\n{files_block({path: content}, numbered=True)}"
        )
    user = f"App idea: {project['idea']}\n\nPlan:\n{plan_block(plan)}\n\n{target}"
    return await llm.json_call(config.FAST_MODEL, prompt("explain"), user, ExplainOut)
