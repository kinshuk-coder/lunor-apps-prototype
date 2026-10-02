"""Validated JSON contracts between stages (LLM outputs + API bodies)."""
from typing import Literal

from pydantic import BaseModel, Field


# ---------- Understand ----------
class Feature(BaseModel):
    name: str
    description: str
    priority: Literal["must", "nice"]


class ClarifyingQuestion(BaseModel):
    question: str
    suggested_answer: str


class UnderstandOut(BaseModel):
    app_name: str = Field(description="Short catchy name for the app")
    summary: str = Field(description="2-3 sentence restatement of the idea")
    target_users: list[str]
    features: list[Feature]
    questions: list[ClarifyingQuestion] = Field(description="2-3 clarifying questions")


# ---------- Plan ----------
class Screen(BaseModel):
    name: str = Field(description="PascalCase screen name, e.g. HomeScreen")
    purpose: str
    components: list[str]


class NavLink(BaseModel):
    from_screen: str
    to_screen: str
    trigger: str


class Entity(BaseModel):
    entity: str
    fields: list[str] = Field(description="'name: type' strings")
    storage: str = Field(description="Where it lives, e.g. AsyncStorage key or component state")


class Task(BaseModel):
    id: int
    title: str
    description: str
    files: list[str] = Field(description="Files this task creates or edits, e.g. screens/HomeScreen.js")


class PlanOut(BaseModel):
    screens: list[Screen]
    navigation: list[NavLink]
    data_model: list[Entity]
    tasks: list[Task]


# ---------- Explain ----------
class LineRef(BaseModel):
    start_line: int
    end_line: int
    note: str


class ExplainOut(BaseModel):
    title: str
    explanation: str = Field(description="Plain-English explanation for a beginner, markdown allowed")
    line_refs: list[LineRef]
    why_this_design: str
    related_task_ids: list[int]


# ---------- Learn ----------
class Concept(BaseModel):
    name: str
    summary: str
    code_snippet: str = Field(description="Short excerpt copied from the user's own code")
    file: str


class QuizQuestion(BaseModel):
    question: str
    options: list[str] = Field(description="Exactly 4 options")
    answer_index: int
    explanation: str


class Challenge(BaseModel):
    title: str
    instructions: str
    hint: str
    success_criteria: str


class LearnOut(BaseModel):
    concepts: list[Concept]
    quiz: list[QuizQuestion]
    challenges: list[Challenge]


class ChallengeCheckOut(BaseModel):
    passed: bool
    feedback: str


# ---------- API bodies ----------
class CreateProject(BaseModel):
    idea: str = Field(min_length=3, max_length=2000)


class PlanRequest(BaseModel):
    answers: list[str] = []


class ExplainRequest(BaseModel):
    path: str | None = None
    start_line: int | None = None
    end_line: int | None = None
    task_id: int | None = None


class FixRequest(BaseModel):
    error: str


class ChangeRequest(BaseModel):
    request: str


class QuizResult(BaseModel):
    score: int
    total: int


class ChallengeCheckRequest(BaseModel):
    challenge_index: int
    files: dict[str, str]


class FilesUpdate(BaseModel):
    files: dict[str, str]
