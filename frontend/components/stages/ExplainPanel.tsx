"use client";

import ReactMarkdown from "react-markdown";
import type { ExplainOut, Task } from "@/lib/types";
import type { Selection } from "../CodeEditor";
import { Spinner } from "../ui";

type Props = {
  activeFile: string;
  selection: Selection | null;
  tasks: Task[];
  result: ExplainOut | null;
  resultFile: string | null;
  loading: boolean;
  onExplain: (req: { path?: string; start_line?: number; end_line?: number; task_id?: number }) => void;
  onShowLines: (file: string, start: number, end: number) => void;
};

export default function ExplainPanel({ activeFile, selection, tasks, result, resultFile, loading, onExplain, onShowLines }: Props) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <div>
        <p className="eyebrow">Explain the code</p>
        <p className="mt-1 text-sm text-zinc-400">Select lines in the editor, explain a whole file, or pick a plan task.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            disabled={!selection || loading}
            onClick={() => selection && onExplain({ path: activeFile, start_line: selection.start, end_line: selection.end })}
            className="btn-primary text-xs"
          >
            {selection ? `Explain lines ${selection.start}–${selection.end}` : "Select lines first"}
          </button>
          <button disabled={loading} onClick={() => onExplain({ path: activeFile })} className="btn-ghost text-xs">
            Explain {activeFile.split("/").pop()}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tasks.map((t, i) => (
            <button
              key={t.id}
              disabled={loading}
              onClick={() => onExplain({ task_id: t.id })}
              title={t.title}
              className="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-300 hover:border-violet-500 hover:text-white"
            >
              Task {i + 1}: {t.title.length > 22 ? t.title.slice(0, 22) + "…" : t.title}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-zinc-400"><Spinner className="h-4 w-4" /> Reading the code…</div>
      )}

      {result && !loading && (
        <div className="space-y-4">
          <div className="card !p-4">
            <h3 className="font-semibold text-white">{result.title}</h3>
            <div className="prose-lunor mt-2 text-sm">
              <ReactMarkdown>{result.explanation}</ReactMarkdown>
            </div>
          </div>
          {result.line_refs.length > 0 && resultFile && (
            <div>
              <p className="eyebrow">Key lines</p>
              <ul className="mt-2 space-y-1.5">
                {result.line_refs.map((r, i) => (
                  <li key={i}>
                    <button
                      onClick={() => onShowLines(resultFile, r.start_line, r.end_line)}
                      className="w-full rounded-lg bg-zinc-900/70 p-2 text-left text-xs hover:bg-zinc-800"
                    >
                      <span className="font-mono text-violet-300">L{r.start_line}{r.end_line !== r.start_line ? `–${r.end_line}` : ""}</span>
                      <span className="ml-2 text-zinc-300">{r.note}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Why this design</p>
            <p className="mt-1.5 text-sm text-zinc-300">{result.why_this_design}</p>
            {result.related_task_ids.length > 0 && (
              <p className="mt-2 text-xs text-zinc-500">
                From plan task{result.related_task_ids.length > 1 ? "s" : ""}:{" "}
                {result.related_task_ids
                  .map((id) => tasks.findIndex((t) => t.id === id))
                  .filter((i) => i >= 0)
                  .map((i) => `#${i + 1} ${tasks[i].title}`)
                  .join(", ")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
