from .. import config, llm
from ..schemas import UnderstandOut
from ..template import prompt


async def run(idea: str) -> UnderstandOut:
    return await llm.json_call(config.FAST_MODEL, prompt("understand"), f"App idea: {idea}", UnderstandOut)
