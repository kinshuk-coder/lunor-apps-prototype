"""Build, fix and change agents: stream file blocks from the strong model."""
from typing import AsyncIterator

from .. import config, llm
from ..template import prompt
from .common import files_block, plan_block, spec_block
from .fileblocks import Event, FileBlockParser


async def _stream(system: str, user: str) -> AsyncIterator[Event]:
    parser = FileBlockParser()
    async for delta in llm.stream_call(config.STRONG_MODEL, system, [{"role": "user", "content": user}]):
        for ev in parser.feed(delta):
            yield ev
    for ev in parser.finish():
        yield ev


def build_task(project: dict, files: dict[str, str], task: dict) -> AsyncIterator[Event]:
    user = (
        f"{spec_block(project)}\n\nApproved plan:\n{plan_block(project['plan'])}\n\n"
        f"Current files:\n\n{files_block(files)}\n\n"
        f"Implement task {task['id']}: {task['title']}\n{task['description']}\n"
        f"Files for this task: {', '.join(task.get('files', []))}"
    )
    return _stream(prompt("build"), user)


def fix(project: dict, files: dict[str, str], error: str) -> AsyncIterator[Event]:
    user = f"Error from the preview:\n{error}\n\nCurrent files:\n\n{files_block(files)}"
    return _stream(prompt("fix"), user)


def change(project: dict, files: dict[str, str], request: str) -> AsyncIterator[Event]:
    user = (
        f"Plan:\n{plan_block(project.get('plan'))}\n\nCurrent files:\n\n{files_block(files)}\n\n"
        f"User's change request: {request}"
    )
    return _stream(prompt("change"), user)
