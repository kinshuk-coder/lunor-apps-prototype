"use client";

import { useState } from "react";
import type { PlanOut, Task } from "@/lib/types";
import { Spinner } from "../ui";

type Props = {
  plan: PlanOut | null;
  approved: boolean;
  builtTaskIds: number[];
  loading: boolean;
  approving: boolean;
  onRegenerate: () => void;
  onApprove: (plan: PlanOut, dirty: boolean) => void;
};

export default function PlanStage({ plan, approved, builtTaskIds, loading, approving, onRegenerate, onApprove }: Props) {
  // The parent remounts this component (via `key`) when a new plan arrives.
  const [draft, setDraft] = useState<PlanOut | null>(plan);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

  if (loading || !draft) {
    return (
      <div className="py-24 text-center">
        {loading ? (
          <>
            <Spinner className="mx-auto h-8 w-8" />
            <p className="mt-4 text-zinc-300">Designing screens, data and build steps…</p>
            <p className="mt-1 text-sm text-zinc-500">The coding model is planning before writing any code.</p>
          </>
        ) : (
          <button onClick={onRegenerate} className="btn-primary">Generate plan</button>
        )}
      </div>
    );
  }

  const setTasks = (tasks: Task[]) => {
    setDraft({ ...draft, tasks });
    setDirty(true);
  };
  const updateTask = (i: number, patch: Partial<Task>) => setTasks(draft.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= draft.tasks.length) return;
    const tasks = [...draft.tasks];
    [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
    setTasks(tasks);
  };
  const remove = (i: number) => setTasks(draft.tasks.filter((_, j) => j !== i));
  const add = () => {
    const id = Math.max(0, ...draft.tasks.map((t) => t.id)) + 1;
    setTasks([...draft.tasks, { id, title: "New task", description: "Describe what to build", files: [] }]);
    setEditing(id);
  };

  const buildLabel = builtTaskIds.length && !dirty && approved ? "Go to build →" : builtTaskIds.length ? "Approve & rebuild changes →" : "Approve plan & build →";

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Build plan</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">Review the plan before any code is written</h2>
          <p className="mt-1 text-sm text-zinc-400">Edit, reorder or add tasks. Changed tasks are rebuilt; unchanged ones are kept.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onRegenerate} className="btn-ghost">↻ Regenerate</button>
          <button onClick={() => onApprove(draft, dirty)} disabled={approving} className="btn-primary">
            {approving ? <Spinner className="h-4 w-4" /> : null}
            {buildLabel}
          </button>
        </div>
      </div>

      <section className="card">
        <p className="eyebrow">Screens &amp; navigation</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {draft.screens.map((s) => {
            const out = draft.navigation.filter((n) => n.from_screen === s.name);
            return (
              <div key={s.name} className="rounded-xl border border-zinc-700/70 bg-zinc-900/60 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📱</span>
                  <p className="font-semibold text-zinc-100">{s.name}</p>
                </div>
                <p className="mt-1 text-sm text-zinc-400">{s.purpose}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.components.map((c) => (
                    <span key={c} className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">{c}</span>
                  ))}
                </div>
                {out.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-zinc-800 pt-2">
                    {out.map((n, i) => (
                      <li key={i} className="text-xs text-zinc-400">
                        <span className="text-violet-300">→ {n.to_screen}</span> · {n.trigger}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="card h-fit">
          <p className="eyebrow">Data model</p>
          <div className="mt-3 space-y-3">
            {draft.data_model.map((e) => (
              <div key={e.entity} className="rounded-lg bg-zinc-900/60 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-mono text-sm font-semibold text-emerald-300">{e.entity}</p>
                  <p className="text-[11px] text-zinc-500">{e.storage}</p>
                </div>
                <ul className="mt-1.5 space-y-0.5">
                  {e.fields.map((f) => (
                    <li key={f} className="font-mono text-xs text-zinc-300">{f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Tasks</p>
            <button onClick={add} className="text-xs text-violet-300 hover:text-violet-200">+ Add task</button>
          </div>
          <ol className="mt-3 space-y-2">
            {draft.tasks.map((t, i) => {
              const built = builtTaskIds.includes(t.id) && !dirty;
              return (
                <li key={t.id} className="group rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                  {editing === t.id ? (
                    <div className="space-y-2">
                      <input className="input w-full text-sm" value={t.title} onChange={(e) => updateTask(i, { title: e.target.value })} />
                      <textarea className="input w-full text-sm" rows={3} value={t.description} onChange={(e) => updateTask(i, { description: e.target.value })} />
                      <input
                        className="input w-full font-mono text-xs"
                        value={t.files.join(", ")}
                        placeholder="files, e.g. screens/HomeScreen.js"
                        onChange={(e) => updateTask(i, { files: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      />
                      <button onClick={() => setEditing(null)} className="btn-ghost text-xs">Done</button>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-xs font-semibold text-violet-200">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-zinc-100">
                          {t.title} {built && <span className="ml-1 text-xs text-emerald-400">✓ built</span>}
                        </p>
                        <p className="text-sm text-zinc-400">{t.description}</p>
                        <p className="mt-1 font-mono text-[11px] text-zinc-500">{t.files.join(" · ")}</p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1 opacity-60 group-hover:opacity-100">
                        <button onClick={() => setEditing(t.id)} className="icon-btn" title="Edit">✎</button>
                        <button onClick={() => move(i, -1)} className="icon-btn" title="Move up">↑</button>
                        <button onClick={() => move(i, 1)} className="icon-btn" title="Move down">↓</button>
                        <button onClick={() => remove(i)} className="icon-btn" title="Delete">✕</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}
