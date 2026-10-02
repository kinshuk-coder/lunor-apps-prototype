"use client";

type Props = {
  paths: string[];
  active: string;
  streaming?: string | null;
  onOpen: (path: string) => void;
};

/** Flat-sorted tree: folders shown as indented group headers. */
export default function FileTree({ paths, active, streaming, onOpen }: Props) {
  const sorted = [...paths].sort((a, b) => {
    const da = a.includes("/") ? 1 : 0;
    const dbb = b.includes("/") ? 1 : 0;
    return da - dbb || a.localeCompare(b);
  });
  const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
  return (
    <ul className="space-y-0.5 text-sm">
      {sorted.map((p, i) => {
        const dir = dirOf(p);
        const name = p.slice(p.lastIndexOf("/") + 1);
        const header = dir && dir !== (i > 0 ? dirOf(sorted[i - 1]) : "") ? dir : null;
        return (
          <li key={p}>
            {header && <div className="mt-2 px-2 text-[11px] uppercase tracking-wide text-zinc-500">{header}/</div>}
            <button
              onClick={() => onOpen(p)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left font-mono text-[13px] ${
                p === active ? "bg-violet-600/25 text-violet-100" : "text-zinc-300 hover:bg-zinc-800"
              } ${dir ? "pl-4" : ""}`}
            >
              <span className="text-amber-400/80">JS</span>
              <span className="truncate">{name}</span>
              {streaming === p && <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-violet-400" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
