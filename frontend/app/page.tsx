"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/api";

const EXAMPLES = [
  "A habit tracker for students with streaks",
  "A shared grocery list for roommates",
  "A pocket workout timer with custom intervals",
];

const STEPS = [
  ["Understand", "We restate your idea and ask what matters"],
  ["Plan", "Screens, data and tasks you can edit"],
  ["Build", "Code streams in and runs on a phone"],
  ["Explain", "Any line, in plain English"],
  ["Learn", "Concepts, a quiz and challenges from your code"],
];

export default function Home() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (text: string) => {
    if (text.trim().length < 3) return;
    setLoading(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/projects", { body: { idea: text.trim() } });
      router.push(`/project/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-16">
      <p className="flex items-center gap-2 font-semibold text-white">
        <span className="text-2xl">☾</span> Lunor <span className="text-violet-400">Apps</span>
      </p>
      <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
        Describe an app.<br />
        <span className="bg-gradient-to-r from-violet-300 to-sky-300 bg-clip-text text-transparent">Watch it get built. Learn how it works.</span>
      </h1>
      <p className="mt-4 text-zinc-400">
        Lunor plans your mobile app with you, writes it step by step, runs it on a phone right here, then teaches you the code.
      </p>

      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          start(idea);
        }}
      >
        <div className="card !p-3 focus-within:border-violet-600">
          <textarea
            autoFocus
            rows={3}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                start(idea);
              }
            }}
            placeholder="e.g. a habit tracker for students with streaks"
            className="w-full resize-none bg-transparent px-2 py-1 text-lg text-white outline-none placeholder:text-zinc-600"
          />
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setIdea(ex);
                    start(ex);
                  }}
                  className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-violet-500 hover:text-white"
                >
                  {ex}
                </button>
              ))}
            </div>
            <button disabled={loading || idea.trim().length < 3} className="btn-primary shrink-0">
              {loading ? <Spinner className="h-4 w-4" /> : null} Build it →
            </button>
          </div>
        </div>
      </form>
      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      <ol className="mt-12 grid gap-3 sm:grid-cols-5">
        {STEPS.map(([title, desc], i) => (
          <li key={title} className="rounded-xl border border-zinc-800/80 p-3">
            <p className="text-xs text-violet-300">{i + 2}</p>
            <p className="mt-1 text-sm font-medium text-white">{title}</p>
            <p className="mt-1 text-xs text-zinc-500">{desc}</p>
          </li>
        ))}
      </ol>
    </main>
  );
}
