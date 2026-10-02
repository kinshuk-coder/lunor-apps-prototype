"use client";

import { useState } from "react";
import type { UnderstandOut } from "@/lib/types";
import { Spinner } from "../ui";

type Props = {
  idea: string;
  data: UnderstandOut | null;
  initialAnswers: string[] | null;
  loading: boolean;
  planning: boolean;
  onRetry: () => void;
  onContinue: (answers: string[]) => void;
};

export default function UnderstandStage({ idea, data, initialAnswers, loading, planning, onRetry, onContinue }: Props) {
  const [answers, setAnswers] = useState<string[]>(initialAnswers ?? []);
  const [accepted, setAccepted] = useState<boolean[]>(() => (initialAnswers ?? []).map(Boolean));

  if (loading || !data) {
    return (
      <div className="mx-auto max-w-3xl py-24 text-center">
        {loading ? (
          <>
            <Spinner className="mx-auto h-8 w-8" />
            <p className="mt-4 text-zinc-300">Reading your idea…</p>
            <p className="mt-1 text-sm text-zinc-500">&ldquo;{idea}&rdquo;</p>
          </>
        ) : (
          <button onClick={onRetry} className="btn-primary">Analyse my idea</button>
        )}
      </div>
    );
  }

  const answerFor = (i: number) => answers[i] ?? "";
  const setAnswer = (i: number, v: string) => {
    const next = [...answers];
    next[i] = v;
    setAnswers(next);
  };
  const accept = (i: number) => {
    setAnswer(i, data.questions[i].suggested_answer);
    const a = [...accepted];
    a[i] = true;
    setAccepted(a);
  };
  const acceptAll = () => {
    setAnswers(data.questions.map((q, i) => answers[i] || q.suggested_answer));
    setAccepted(data.questions.map(() => true));
  };
  const finalAnswers = data.questions.map((q, i) => answers[i]?.trim() || q.suggested_answer);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 py-8 lg:grid-cols-[1fr_1.1fr]">
      <section className="space-y-6">
        <div className="card">
          <p className="eyebrow">What we understood</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">{data.app_name}</h2>
          <p className="mt-3 leading-relaxed text-zinc-300">{data.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {data.target_users.map((u) => (
              <span key={u} className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">👤 {u}</span>
            ))}
          </div>
        </div>
        <div className="card">
          <p className="eyebrow">Core features</p>
          <ul className="mt-3 space-y-3">
            {data.features.map((f) => (
              <li key={f.name} className="flex gap-3">
                <span className={`mt-0.5 h-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                  f.priority === "must" ? "bg-violet-500/20 text-violet-300" : "bg-zinc-800 text-zinc-400"
                }`}>
                  {f.priority === "must" ? "Must" : "Nice"}
                </span>
                <div>
                  <p className="font-medium text-zinc-100">{f.name}</p>
                  <p className="text-sm text-zinc-400">{f.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card h-fit">
        <div className="flex items-center justify-between">
          <p className="eyebrow">A few quick questions</p>
          <button onClick={acceptAll} className="text-xs text-violet-300 hover:text-violet-200">Accept all suggestions</button>
        </div>
        <div className="mt-4 space-y-5">
          {data.questions.map((q, i) => (
            <div key={q.question}>
              <p className="font-medium text-zinc-100">{q.question}</p>
              <div className="mt-2 flex items-start gap-2">
                <textarea
                  rows={2}
                  value={answerFor(i)}
                  onChange={(e) => setAnswer(i, e.target.value)}
                  placeholder={q.suggested_answer}
                  className="input flex-1 resize-none text-sm"
                />
                <button
                  onClick={() => accept(i)}
                  className={`shrink-0 rounded-lg px-3 py-2 text-xs ${
                    accepted[i] && answerFor(i) === q.suggested_answer
                      ? "bg-emerald-600/20 text-emerald-300"
                      : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                  }`}
                >
                  {accepted[i] && answerFor(i) === q.suggested_answer ? "✓ Accepted" : "Use suggestion"}
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-5 text-xs text-zinc-500">Blank answers use the suggestion.</p>
        <button onClick={() => onContinue(finalAnswers)} disabled={planning} className="btn-primary mt-3 w-full">
          {planning ? (<><Spinner className="h-4 w-4" /> Drafting your build plan…</>) : "Continue to plan →"}
        </button>
      </section>
    </div>
  );
}
