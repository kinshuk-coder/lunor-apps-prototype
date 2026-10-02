"use client";

import { useState } from "react";
import type { LearnOut } from "@/lib/types";
import { Spinner } from "../ui";

type Props = {
  data: LearnOut | null;
  loading: boolean;
  onGenerate: () => void;
  onShowSnippet: (file: string, snippet: string) => void;
  onQuizDone: (score: number, total: number) => void;
  onCheck: (challengeIndex: number) => Promise<{ passed: boolean; feedback: string }>;
};

type Tab = "concepts" | "quiz" | "challenges";

export default function LearnPanel({ data, loading, onGenerate, onShowSnippet, onQuizDone, onCheck }: Props) {
  const [tab, setTab] = useState<Tab>("concepts");
  const [open, setOpen] = useState<number | null>(0);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [checking, setChecking] = useState<number | null>(null);
  const [checks, setChecks] = useState<Record<number, { passed: boolean; feedback: string }>>({});

  if (!data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        {loading ? (
          <>
            <Spinner className="h-7 w-7" />
            <p className="text-sm text-zinc-400">Turning your app into a lesson…</p>
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-400">Learn the concepts used in your own app.</p>
            <button onClick={onGenerate} className="btn-primary">Create my lesson</button>
          </>
        )}
      </div>
    );
  }

  const answered = Object.keys(picked).length;
  const score = data.quiz.filter((q, i) => picked[i] === q.answer_index).length;

  const pick = (qi: number, oi: number) => {
    if (picked[qi] !== undefined) return;
    const next = { ...picked, [qi]: oi };
    setPicked(next);
    if (Object.keys(next).length === data.quiz.length) {
      onQuizDone(data.quiz.filter((q, i) => next[i] === q.answer_index).length, data.quiz.length);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex rounded-lg bg-zinc-900 p-1 text-xs">
        {(["concepts", "quiz", "challenges"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md py-1.5 capitalize ${tab === t ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-white"}`}
          >
            {t === "quiz" ? `Quiz ${answered}/${data.quiz.length}` : t}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {tab === "concepts" &&
          data.concepts.map((c, i) => (
            <div key={c.name} className="rounded-xl border border-zinc-800 bg-zinc-900/60">
              <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between p-3 text-left">
                <span className="font-mono text-sm font-semibold text-violet-200">{c.name}</span>
                <span className="text-zinc-500">{open === i ? "−" : "+"}</span>
              </button>
              {open === i && (
                <div className="space-y-2 px-3 pb-3">
                  <p className="text-sm text-zinc-300">{c.summary}</p>
                  <pre className="overflow-x-auto rounded-lg bg-black/60 p-2 text-[11px] text-emerald-200">{c.code_snippet}</pre>
                  <button onClick={() => onShowSnippet(c.file, c.code_snippet)} className="text-xs text-violet-300 hover:text-violet-200">
                    Show in {c.file} →
                  </button>
                </div>
              )}
            </div>
          ))}

        {tab === "quiz" && (
          <>
            {data.quiz.map((q, qi) => (
              <div key={qi} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="text-sm font-medium text-zinc-100">{qi + 1}. {q.question}</p>
                <div className="mt-2 space-y-1.5">
                  {q.options.map((o, oi) => {
                    const chosen = picked[qi];
                    const reveal = chosen !== undefined;
                    const cls = !reveal
                      ? "border-zinc-700 hover:border-violet-500"
                      : oi === q.answer_index
                        ? "border-emerald-600 bg-emerald-950/40 text-emerald-200"
                        : oi === chosen
                          ? "border-rose-700 bg-rose-950/40 text-rose-200"
                          : "border-zinc-800 text-zinc-500";
                    return (
                      <button key={oi} onClick={() => pick(qi, oi)} className={`w-full rounded-lg border px-3 py-1.5 text-left text-xs ${cls}`}>
                        {o}
                      </button>
                    );
                  })}
                </div>
                {picked[qi] !== undefined && <p className="mt-2 text-xs text-zinc-400">{q.explanation}</p>}
              </div>
            ))}
            {answered === data.quiz.length && (
              <div className="rounded-xl bg-violet-600/20 p-3 text-center text-sm text-violet-100">
                You scored {score}/{data.quiz.length}. {score === data.quiz.length ? "Perfect! 🎉" : "Nice work. Check the explanations above."}
              </div>
            )}
          </>
        )}

        {tab === "challenges" && (
          <>
            <p className="text-xs text-zinc-500">Edit the code in the editor; the preview updates as you type. Then ask the AI to check it.</p>
            {data.challenges.map((c, i) => (
              <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="font-semibold text-zinc-100">🛠 {c.title}</p>
                <p className="mt-1 text-sm text-zinc-300">{c.instructions}</p>
                <details className="mt-2 text-xs text-zinc-400">
                  <summary className="cursor-pointer text-violet-300">Hint</summary>
                  <p className="mt-1">{c.hint}</p>
                </details>
                <button
                  disabled={checking !== null}
                  onClick={async () => {
                    setChecking(i);
                    try {
                      const r = await onCheck(i);
                      setChecks((s) => ({ ...s, [i]: r }));
                    } catch (e) {
                      setChecks((s) => ({ ...s, [i]: { passed: false, feedback: (e as Error).message } }));
                    } finally {
                      setChecking(null);
                    }
                  }}
                  className="btn-ghost mt-3 w-full text-xs"
                >
                  {checking === i ? (<><Spinner className="h-3 w-3" /> Checking…</>) : "Check my solution"}
                </button>
                {checks[i] && (
                  <p className={`mt-2 rounded-lg p-2 text-xs ${checks[i].passed ? "bg-emerald-950/50 text-emerald-200" : "bg-amber-950/40 text-amber-200"}`}>
                    {checks[i].passed ? "✅ " : "💡 "}
                    {checks[i].feedback}
                  </p>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
