export type Feature = { name: string; description: string; priority: "must" | "nice" };
export type ClarifyingQuestion = { question: string; suggested_answer: string };
export type UnderstandOut = {
  app_name: string;
  summary: string;
  target_users: string[];
  features: Feature[];
  questions: ClarifyingQuestion[];
};

export type Screen = { name: string; purpose: string; components: string[] };
export type NavLink = { from_screen: string; to_screen: string; trigger: string };
export type Entity = { entity: string; fields: string[]; storage: string };
export type Task = { id: number; title: string; description: string; files: string[] };
export type PlanOut = { screens: Screen[]; navigation: NavLink[]; data_model: Entity[]; tasks: Task[] };

export type LineRef = { start_line: number; end_line: number; note: string };
export type ExplainOut = {
  title: string;
  explanation: string;
  line_refs: LineRef[];
  why_this_design: string;
  related_task_ids: number[];
};

export type Concept = { name: string; summary: string; code_snippet: string; file: string };
export type QuizQuestion = { question: string; options: string[]; answer_index: number; explanation: string };
export type Challenge = { title: string; instructions: string; hint: string; success_criteria: string };
export type LearnOut = { concepts: Concept[]; quiz: QuizQuestion[]; challenges: Challenge[] };

export type Files = Record<string, string>;

export type Project = {
  id: string;
  idea: string;
  understand: UnderstandOut | null;
  answers: string[] | null;
  plan: PlanOut | null;
  plan_approved: boolean;
  built_task_ids: number[];
  learn: LearnOut | null;
  quiz: { score: number; total: number } | null;
  files: Files;
};

export type Stage = "understand" | "plan" | "build" | "explain" | "learn";
