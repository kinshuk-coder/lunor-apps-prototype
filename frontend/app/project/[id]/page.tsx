"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Highlight, Selection } from "@/components/CodeEditor";
import FileTree from "@/components/FileTree";
import type { PreviewError } from "@/components/PhonePreview";
import BuildPanel, { type LogLine } from "@/components/stages/BuildPanel";
import ExplainPanel from "@/components/stages/ExplainPanel";
import LearnPanel from "@/components/stages/LearnPanel";
import PlanStage from "@/components/stages/PlanStage";
import UnderstandStage from "@/components/stages/UnderstandStage";
import { ErrorBanner, Spinner } from "@/components/ui";
import { api, streamSSE } from "@/lib/api";
import type { ExplainOut, Files, LearnOut, PlanOut, Project, Stage, UnderstandOut } from "@/lib/types";

const CodeEditor = dynamic(() => import("@/components/CodeEditor"), { ssr: false });
const PhonePreview = dynamic(() => import("@/components/PhonePreview"), { ssr: false });

const MAX_FIX_RETRIES = 2;
const STAGES: { key: Stage | "prompt"; label: string }[] = [
  { key: "prompt", label: "Prompt" },
  { key: "understand", label: "Understand" },
  { key: "plan", label: "Plan" },
  { key: "build", label: "Build" },
  { key: "explain", label: "Explain" },
  { key: "learn", label: "Learn" },
];

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [stage, setStage] = useState<Stage>("understand");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const setBusyKey = (k: string, v: boolean) => setBusy((b) => ({ ...b, [k]: v }));

  // Workspace state
  const [files, setFiles] = useState<Files>({});
  const [previewFiles, setPreviewFiles] = useState<Files>({});
  const [activeFile, setActiveFile] = useState("App.js");
  const [streamingPath, setStreamingPath] = useState<string | null>(null);
  const [currentTaskId, setCurrentTaskId] = useState<number | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [explainResult, setExplainResult] = useState<ExplainOut | null>(null);
  const [explainFile, setExplainFile] = useState<string | null>(null);

  const streamingRef = useRef(false); // build / fix / change in progress
  const fixAttempts = useRef(0);
  const aiChange = useRef(false); // last code change came from the AI (auto-fix only then)
  const addLog = (l: LogLine) => setLog((x) => [...x, l]);

  const [planVersion, setPlanVersion] = useState(0); // remounts PlanStage when a new plan is generated
  const patchProject = (patch: Partial<Project>) => setProject((p) => (p ? { ...p, ...patch } : p));

  // ---------- Understand + Plan ----------
  const runUnderstand = async (fresh = false) => {
    setBusyKey("understand", true);
    setError(null);
    try {
      const u = await api<UnderstandOut>(`/projects/${id}/understand${fresh ? "?fresh=1" : ""}`, { body: {} });
      patchProject({ understand: u });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyKey("understand", false);
    }
  };

  const runPlan = async (answers: string[], fresh = false) => {
    setBusyKey("plan", true);
    setError(null);
    try {
      const plan = await api<PlanOut>(`/projects/${id}/plan${fresh ? "?fresh=1" : ""}`, { body: { answers } });
      patchProject({ plan, answers, plan_approved: false, built_task_ids: [] });
      setPlanVersion((v) => v + 1);
      setStage("plan");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyKey("plan", false);
    }
  };

  const approvePlan = async (plan: PlanOut, dirty: boolean) => {
    setBusyKey("approve", true);
    setError(null);
    try {
      let built = project?.built_task_ids ?? [];
      if (dirty) built = (await api<{ built_task_ids: number[] }>(`/projects/${id}/plan`, { method: "PUT", body: plan })).built_task_ids;
      await api(`/projects/${id}/plan/approve`, { body: {} });
      patchProject({ plan, plan_approved: true, built_task_ids: built });
      setStage("build");
      if (plan.tasks.some((t) => !built.includes(t.id))) runBuild();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyKey("approve", false);
    }
  };

  // ---------- load ----------
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return; // React dev mode mounts effects twice
    loaded.current = true;
    api<Project>(`/projects/${id}`)
      .then((p) => {
        setProject(p);
        setFiles(p.files);
        setPreviewFiles(p.files);
        setStage(p.learn ? "learn" : p.built_task_ids.length ? "build" : p.plan ? "plan" : "understand");
        if (!p.understand) runUnderstand();
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ---------- Build / fix / change streams ----------
  // Groq streams very fast; batch file_delta text and flush ~16x/second
  // instead of re-rendering on every token.
  const pendingDeltas = useRef<Record<string, string>>({});
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushDeltas = useCallback(() => {
    flushTimer.current = null;
    const pending = pendingDeltas.current;
    pendingDeltas.current = {};
    if (!Object.keys(pending).length) return;
    setFiles((f) => {
      const next = { ...f };
      for (const [p, t] of Object.entries(pending)) next[p] = (next[p] ?? "") + t;
      return next;
    });
  }, []);

  const handleStream = useCallback((event: string, data: any) => {
    switch (event) {
      case "task_start":
        setCurrentTaskId(data.task_id);
        addLog({ kind: "note", text: `▶ Task: ${data.title}` });
        break;
      case "note":
        if (data.text) addLog({ kind: "note", text: data.text });
        break;
      case "file_start":
        setFiles((f) => ({ ...f, [data.path]: "" }));
        setActiveFile(data.path);
        setStreamingPath(data.path);
        break;
      case "file_delta":
        pendingDeltas.current[data.path] = (pendingDeltas.current[data.path] ?? "") + data.text;
        if (!flushTimer.current) flushTimer.current = setTimeout(flushDeltas, 60);
        break;
      case "file_done":
        delete pendingDeltas.current[data.path]; // final content replaces the partial text
        setFiles((f) => ({ ...f, [data.path]: data.content }));
        setStreamingPath(null);
        addLog({ kind: "ok", text: `  ✓ wrote ${data.path}` });
        break;
      case "file_deleted":
        setFiles((f) => {
          const rest = { ...f };
          delete rest[data.path];
          return rest;
        });
        addLog({ kind: "note", text: `  ✕ deleted ${data.path}` });
        break;
      case "task_done":
        pendingDeltas.current = {};
        setFiles(data.files);
        setPreviewFiles(data.files);
        setActiveFile((a) => (a in data.files ? a : "App.js"));
        if (data.task_id != null) {
          setProject((p) => (p ? { ...p, built_task_ids: [...new Set([...p.built_task_ids, data.task_id])] } : p));
        }
        break;
      case "error":
        addLog({ kind: "error", text: `✕ ${data.message}` });
        setError(data.message);
        break;
    }
  }, [flushDeltas]);

  const runStream = async (path: string, body: unknown, key: string) => {
    if (streamingRef.current) return;
    streamingRef.current = true;
    aiChange.current = true;
    setBusyKey(key, true);
    setError(null);
    try {
      await streamSSE(path, body, handleStream);
    } catch (e) {
      setError((e as Error).message);
      addLog({ kind: "error", text: `✕ ${(e as Error).message}` });
    } finally {
      streamingRef.current = false;
      setStreamingPath(null);
      setCurrentTaskId(null);
      setBusyKey(key, false);
    }
  };

  const runBuild = () => {
    fixAttempts.current = 0;
    return runStream(`/projects/${id}/build`, {}, "build");
  };

  const runChange = (request: string) => {
    fixAttempts.current = 0;
    addLog({ kind: "note", text: `▶ Change: ${request}` });
    return runStream(`/projects/${id}/change`, { request }, "change");
  };

  const onPreviewError = (err: PreviewError) => {
    if (streamingRef.current || !aiChange.current) return;
    if (fixAttempts.current >= MAX_FIX_RETRIES) {
      addLog({ kind: "error", text: `✕ Preview error (auto-fix limit reached): ${err.message.slice(0, 200)}` });
      return;
    }
    fixAttempts.current += 1;
    addLog({ kind: "error", text: `✕ Preview error: ${err.message.slice(0, 200)}` });
    addLog({ kind: "fix", text: `↻ Auto-fix attempt ${fixAttempts.current}/${MAX_FIX_RETRIES}` });
    runStream(`/projects/${id}/fix`, { error: err.message }, "fix");
  };

  const onPreviewHealthy = () => {
    if (fixAttempts.current > 0) addLog({ kind: "ok", text: "✓ App running again" });
    fixAttempts.current = 0;
  };

  // ---------- user edits (Learn challenges) ----------
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEdit = (value: string) => {
    aiChange.current = false;
    const next = { ...files, [activeFile]: value };
    setFiles(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setPreviewFiles(next);
      api(`/projects/${id}/files`, { method: "PUT", body: { files: { [activeFile]: value } } }).catch(() => {});
    }, 900);
  };

  // ---------- Explain ----------
  const runExplain = async (req: { path?: string; start_line?: number; end_line?: number; task_id?: number }) => {
    setBusyKey("explain", true);
    setError(null);
    try {
      const r = await api<ExplainOut>(`/projects/${id}/explain`, { body: req });
      let file = req.path ?? null;
      if (req.task_id != null) {
        const task = project?.plan?.tasks.find((t) => t.id === req.task_id);
        file = task?.files.find((f) => f in files) ?? null;
      }
      setExplainResult(r);
      setExplainFile(file);
      if (file) {
        setActiveFile(file);
        setHighlights(r.line_refs.map((l) => ({ start: l.start_line, end: l.end_line, note: l.note })));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyKey("explain", false);
    }
  };

  const showLines = (file: string, start: number, end: number) => {
    setActiveFile(file);
    setHighlights([{ start, end }]);
  };

  // ---------- Learn ----------
  const runLearn = async () => {
    setBusyKey("learn", true);
    setError(null);
    try {
      const l = await api<LearnOut>(`/projects/${id}/learn`, { body: {} });
      patchProject({ learn: l });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyKey("learn", false);
    }
  };

  const showSnippet = (file: string, snippet: string) => {
    const content = files[file];
    if (!content) return;
    const first = snippet.split("\n").find((l) => l.trim())?.trim() ?? "";
    const lines = content.split("\n");
    const idx = lines.findIndex((l) => first && l.includes(first));
    setActiveFile(file);
    if (idx >= 0) setHighlights([{ start: idx + 1, end: idx + snippet.trim().split("\n").length }]);
  };

  const checkChallenge = (i: number) =>
    api<{ passed: boolean; feedback: string }>(`/projects/${id}/challenge/check`, { body: { challenge_index: i, files } });

  // ---------- navigation ----------
  const built = (project?.built_task_ids.length ?? 0) > 0;
  const enabled: Record<Stage, boolean> = {
    understand: true,
    plan: !!project?.plan,
    build: !!project?.plan_approved || built,
    explain: built,
    learn: built,
  };
  const goto = (s: Stage) => {
    if (!enabled[s]) return;
    setHighlights([]);
    setStage(s);
    if (s === "learn" && !project?.learn && !busy.learn) runLearn();
  };

  const filePaths = useMemo(() => Object.keys(files), [files]);
  const workspace = stage === "build" || stage === "explain" || stage === "learn";

  if (!project) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        {error ? <ErrorBanner message={error} /> : <Spinner className="h-8 w-8" />}
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-6 border-b border-zinc-800 bg-zinc-950/80 px-5 py-3 backdrop-blur">
        <Link href="/" className="flex items-center gap-2 font-semibold text-white">
          <span className="text-xl">☾</span> Lunor <span className="text-violet-400">Apps</span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {STAGES.map((s, i) => {
            const key = s.key;
            const isActive = key === stage;
            const on = key === "prompt" || enabled[key as Stage];
            const inner = (
              <>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${isActive ? "bg-white text-violet-700" : "bg-zinc-800"}`}>{i + 1}</span>
                {s.label}
              </>
            );
            const cls = `flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
              isActive ? "bg-violet-600 text-white" : on ? "text-zinc-300 hover:bg-zinc-800" : "cursor-not-allowed text-zinc-600"
            }`;
            return key === "prompt" ? (
              <Link key={key} href="/" className={cls} title={project.idea}>{inner}</Link>
            ) : (
              <button key={key} onClick={() => goto(key as Stage)} disabled={!on} className={cls}>{inner}</button>
            );
          })}
        </nav>
        <p className="ml-auto hidden max-w-xs truncate text-sm text-zinc-500 xl:block" title={project.idea}>
          {project.understand?.app_name ?? project.idea}
        </p>
      </header>

      {error && (
        <div className="shrink-0 px-5 pt-3">
          <ErrorBanner message={error} onClose={() => setError(null)} />
        </div>
      )}

      {!workspace && (
        <div className="flex-1 overflow-y-auto px-5">
          {stage === "understand" && (
            <UnderstandStage
              idea={project.idea}
              data={project.understand}
              initialAnswers={project.answers}
              loading={!!busy.understand}
              planning={!!busy.plan}
              onRetry={() => runUnderstand(true)}
              onContinue={(answers) => runPlan(answers)}
            />
          )}
          {stage === "plan" && (
            <PlanStage
              key={planVersion}
              plan={project.plan}
              approved={project.plan_approved}
              builtTaskIds={project.built_task_ids}
              loading={!!busy.plan}
              approving={!!busy.approve}
              onRegenerate={() => runPlan(project.answers ?? [], true)}
              onApprove={(plan, dirty) => (project.plan_approved && !dirty && built ? setStage("build") : approvePlan(plan, dirty))}
            />
          )}
        </div>
      )}

      {workspace && (
        <div className="grid min-h-0 flex-1 grid-cols-[340px_minmax(0,1fr)_340px]">
          <aside className="min-h-0 border-r border-zinc-800 p-4">
            {stage === "build" && (
              <BuildPanel
                tasks={project.plan?.tasks ?? []}
                builtTaskIds={project.built_task_ids}
                currentTaskId={currentTaskId}
                building={!!busy.build}
                fixing={!!busy.fix}
                log={log}
                onBuild={runBuild}
                onChange={runChange}
              />
            )}
            {stage === "explain" && (
              <ExplainPanel
                activeFile={activeFile}
                selection={selection}
                tasks={project.plan?.tasks ?? []}
                result={explainResult}
                resultFile={explainFile}
                loading={!!busy.explain}
                onExplain={runExplain}
                onShowLines={showLines}
              />
            )}
            {stage === "learn" && (
              <LearnPanel
                data={project.learn}
                loading={!!busy.learn}
                onGenerate={runLearn}
                onShowSnippet={showSnippet}
                onQuizDone={(score, total) => api(`/projects/${id}/quiz`, { body: { score, total } }).catch(() => {})}
                onCheck={checkChallenge}
              />
            )}
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col">
            <div className="flex min-h-0 flex-1">
              <div className="w-48 shrink-0 overflow-y-auto border-r border-zinc-800 p-2">
                <FileTree paths={filePaths} active={activeFile} streaming={streamingPath} onOpen={(p) => { setActiveFile(p); setHighlights([]); }} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 text-xs text-zinc-400">
                  <span className="font-mono">{activeFile}</span>
                  <span>
                    {stage === "learn" ? "✎ Editable: try the challenges" : stage === "explain" ? "Select lines to explain them" : streamingPath ? "Writing…" : "Read-only"}
                  </span>
                </div>
                <div className="min-h-0 flex-1">
                  <CodeEditor
                    path={activeFile}
                    value={files[activeFile] ?? ""}
                    readOnly={stage !== "learn" || !!streamingPath}
                    highlights={highlights}
                    onChange={stage === "learn" ? onEdit : undefined}
                    onSelect={setSelection}
                    followTail={streamingPath === activeFile}
                  />
                </div>
              </div>
            </div>
          </section>

          <aside className="flex min-h-0 justify-center overflow-y-auto border-l border-zinc-800 p-4">
            <PhonePreview files={previewFiles} onError={onPreviewError} onHealthy={onPreviewHealthy} />
          </aside>
        </div>
      )}
    </main>
  );
}
