"use client";

import { useState } from "react";
import type { Task } from "@/lib/types";
import { Spinner } from "../ui";

export type LogLine = { kind: "note" | "error" | "fix" | "ok"; text: string };

type Props = {
  tasks: Task[];
  builtTaskIds: number[];
  currentTaskId: number | null;
  building: boolean;
  fixing: boolean;
  log: LogLine[];
  onBuild: () => void;
  onChange: (request: string) => void;
};

export default function BuildPanel({ tasks, builtTaskIds, currentTaskId, building, fixing, log, onBuild, onChange }: Props) {
  const [request, setRequest] = useState("");
  const remaining = tasks.filter((t) => !builtTaskIds.includes(t.id)).length;
  const busy = building || fixing;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto">
      <div>
        <div className="flex items-center justify-between">
          <p className="eyebrow">Build tasks</p>
          <span className="text-xs text-zinc-500">{builtTaskIds.length}/{tasks.length} done</span>
        </div>
        <ol className="mt-2 space-y-1.5">
          {tasks.map((t, i) => {
            const done = builtTaskIds.includes(t.id);
            const running = currentTaskId === t.id;
            return (
              <li key={t.id} className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm ${running ? "bg-violet-600/15" : ""}`}>
                <span className="mt-0.5 w-4 shrink-0 text-center">
                  {running ? <Spinner className="h-4 w-4" /> : done ? <span className="text-emerald-400">✓</span> : <span className="text-zinc-600">{i + 1}</span>}
                </span>
                <span className={done ? "text-zinc-300" : running ? "text-white" : "text-zinc-500"}>{t.title}</span>
              </li>
            );
          })}
        </ol>
        {remaining > 0 && (
          <button onClick={onBuild} disabled={busy} className="btn-primary mt-3 w-full">
            {building ? (<><Spinner className="h-4 w-4" /> Building…</>) : builtTaskIds.length ? `Build ${remaining} remaining task${remaining > 1 ? "s" : ""}` : "Start building"}
          </button>
        )}
      </div>

      <div className="min-h-[120px] flex-1 overflow-y-auto rounded-lg bg-zinc-950/60 p-3 font-mono text-xs leading-relaxed">
        {log.length === 0 ? (
          <p className="text-zinc-600">Build activity will appear here.</p>
        ) : (
          log.map((l, i) => (
            <p key={i} className={{ note: "text-zinc-400", error: "text-rose-400", fix: "text-amber-300", ok: "text-emerald-400" }[l.kind]}>
              {l.text}
            </p>
          ))
        )}
        {fixing && <p className="mt-1 flex items-center gap-2 text-amber-300"><Spinner className="h-3 w-3" /> Fixing the error…</p>}
      </div>

      {remaining === 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!request.trim()) return;
            onChange(request.trim());
            setRequest("");
          }}
          className="space-y-2"
        >
          <p className="eyebrow">Ask for a change</p>
          <textarea
            rows={2}
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder='e.g. "make streaks weekly" or "add a dark header"'
            className="input w-full resize-none text-sm"
          />
          <button disabled={busy || !request.trim()} className="btn-ghost w-full">Apply change</button>
        </form>
      )}
    </div>
  );
}
