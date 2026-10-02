from .. import config, llm
from ..schemas import ChallengeCheckOut, LearnOut
from ..template import prompt
from .common import files_block


async def run(project: dict, files: dict[str, str]) -> LearnOut:
    user = f"App idea: {project['idea']}\n\nThe learner's app code:\n\n{files_block(files)}"
    return await llm.json_call(config.FAST_MODEL, prompt("learn"), user, LearnOut, temperature=0.5)


async def check(challenge: dict, files: dict[str, str]) -> ChallengeCheckOut:
    user = (
        f"Challenge: {challenge['title']}\nInstructions: {challenge['instructions']}\n"
        f"Success criteria: {challenge['success_criteria']}\n\nLearner's files:\n\n{files_block(files)}"
    )
    return await llm.json_call(config.STRONG_MODEL, prompt("check"), user, ChallengeCheckOut, temperature=0.1)
