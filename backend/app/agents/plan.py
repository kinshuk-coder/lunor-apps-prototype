from .. import config, llm
from ..schemas import PlanOut
from ..template import prompt
from .common import spec_block


async def run(project: dict) -> PlanOut:
    user = f"{spec_block(project)}\n\nWrite the build plan."
    return await llm.json_call(config.STRONG_MODEL, prompt("plan"), user, PlanOut, temperature=0.3)
