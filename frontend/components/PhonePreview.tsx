"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import type { Files } from "@/lib/types";

// Packages the backend template allows; anything else imported is ignored.
const ALLOWED = new Set([
  "expo-status-bar",
  "@react-navigation/native",
  "@react-navigation/native-stack",
  "@react-navigation/bottom-tabs",
  "react-native-screens",
  "react-native-safe-area-context",
  "@react-native-async-storage/async-storage",
  "@expo/vector-icons",
]);
// Peer packages react-navigation needs at runtime.
const NAV_PEERS = ["react-native-screens", "react-native-safe-area-context"];

/** Work out Snack dependencies from the import statements in the files. */
function dependenciesFor(files: Files): Record<string, { version: string }> {
  const deps: Record<string, { version: string }> = {};
  const re = /(?:import[^'"]*from\s*|import\s*|require\()\s*['"]([^'"]+)['"]/g;
  for (const src of Object.values(files)) {
    for (const m of src.matchAll(re)) {
      const spec = m[1];
      if (spec.startsWith(".")) continue;
      const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
      if (ALLOWED.has(pkg)) deps[pkg] = { version: "*" };
    }
  }
  if (Object.keys(deps).some((d) => d.startsWith("@react-navigation/"))) {
    NAV_PEERS.forEach((p) => (deps[p] = { version: "*" }));
  }
  return deps;
}

function toSnackFiles(files: Files) {
  return Object.fromEntries(Object.entries(files).map(([p, contents]) => [p, { type: "CODE" as const, contents }]));
}

export type PreviewError = { message: string; key: string };

type Props = {
  files: Files;
  onError?: (err: PreviewError) => void;
  onHealthy?: () => void;
};

export default function PhonePreview({ files, onError, onHealthy }: Props) {
  const webPreviewRef = useRef<Window | null>(null);
  const snackRef = useRef<any>(null);
  const [webPreviewURL, setWebPreviewURL] = useState<string>();
  const [expoUrl, setExpoUrl] = useState<string>();
  const [status, setStatus] = useState<"loading" | "ok" | "error" | "reloading">("loading");
  const [showQR, setShowQR] = useState(false);
  const lastErrorKey = useRef("");
  const onErrorRef = useRef(onError);
  const onHealthyRef = useRef(onHealthy);
  useEffect(() => {
    onErrorRef.current = onError;
    onHealthyRef.current = onHealthy;
  }, [onError, onHealthy]);

  const reportError = (message: string) => {
    const key = message.slice(0, 300);
    if (key === lastErrorKey.current) return;
    lastErrorKey.current = key;
    onErrorRef.current?.({ message, key });
  };

  // Create the Snack once (browser only).
  useEffect(() => {
    let cancelled = false;
    const subs: Array<() => void> = [];
    (async () => {
      const { Snack } = await import("snack-sdk");
      if (cancelled) return;
      const snack = new Snack({
        name: "Lunor App",
        files: toSnackFiles(files),
        dependencies: dependenciesFor(files),
        webPreviewRef,
        online: true,
        codeChangesDelay: 500,
      });
      snackRef.current = snack;
      const sync = (state: any, prev?: any) => {
        setWebPreviewURL(state.webPreviewURL);
        setExpoUrl(state.url);
        // Pin "*" dependencies to the versions compatible with the Snack's Expo SDK,
        // and add any peer packages the resolver says are missing.
        const wanted = state.wantedDependencyVersions ?? {};
        const pin: Record<string, { version: string }> = {};
        for (const [name, dep] of Object.entries<any>(state.dependencies)) {
          if (dep.version === "*" && wanted[name]) pin[name] = { version: wanted[name] };
        }
        for (const [name, info] of Object.entries<any>(state.missingDependencies ?? {})) {
          if (!state.dependencies[name]) pin[name] = { version: info.wantedVersion ?? "*" };
        }
        if (Object.keys(pin).length) snack.updateDependencies(pin);

        const clients = Object.values<any>(state.connectedClients ?? {});
        const errored = clients.find((c) => c.status === "error" && c.error);
        if (errored) {
          setStatus("error");
          const e = errored.error;
          const where = e.fileName ? ` (${e.fileName}${e.lineNumber ? `:${e.lineNumber}` : ""})` : "";
          reportError(`${e.message}${where}`);
        } else if (clients.some((c) => c.status === "reloading")) {
          setStatus("reloading");
        } else if (clients.length) {
          setStatus("ok");
          if (prev && Object.values<any>(prev.connectedClients ?? {}).some((c) => c.status !== "ok")) {
            lastErrorKey.current = "";
            onHealthyRef.current?.();
          }
        }
      };
      sync(snack.getState());
      subs.push(snack.addStateListener(sync));
      subs.push(
        snack.addLogListener((log: any) => {
          if (log.type === "error") reportError(log.error?.message || log.message);
        }),
      );
    })();
    return () => {
      cancelled = true;
      subs.forEach((s) => s());
      snackRef.current?.setOnline(false);
      snackRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push file changes (hot reload).
  useEffect(() => {
    const snack = snackRef.current;
    if (!snack) return;
    const current = snack.getState().files as Record<string, unknown>;
    const update: Record<string, any> = toSnackFiles(files);
    for (const p of Object.keys(current)) if (!(p in files)) update[p] = null;
    snack.updateFiles(update);
    const deps = dependenciesFor(files);
    const existing = snack.getState().dependencies;
    const newDeps = Object.fromEntries(Object.entries(deps).filter(([k]) => !existing[k]));
    if (Object.keys(newDeps).length) snack.updateDependencies(newDeps);
    lastErrorKey.current = "";
  }, [files]);

  const statusColor = { loading: "bg-zinc-500", ok: "bg-emerald-500", error: "bg-rose-500", reloading: "bg-amber-500" }[status];

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-[620px] w-[300px] rounded-[44px] border-[10px] border-zinc-800 bg-black shadow-2xl shadow-violet-900/30">
        <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-zinc-900" />
        <div className="h-full w-full overflow-hidden rounded-[34px] bg-white">
          {webPreviewURL ? (
            <iframe
              ref={(el) => {
                webPreviewRef.current = el?.contentWindow ?? null;
              }}
              src={webPreviewURL}
              className="h-full w-full border-0"
              allow="geolocation; camera; microphone"
              title="App preview"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-400">Starting preview…</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${statusColor}`} />
          {status === "ok" ? "Running" : status === "error" ? "Error" : status === "reloading" ? "Reloading" : "Connecting"}
        </span>
        {expoUrl && (
          <button onClick={() => setShowQR((s) => !s)} className="rounded-md border border-zinc-700 px-2 py-1 hover:bg-zinc-800">
            {showQR ? "Hide QR" : "Open on your phone"}
          </button>
        )}
      </div>
      {showQR && expoUrl && (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-white p-3">
          <QRCodeSVG value={expoUrl} size={140} />
          <p className="max-w-[180px] text-center text-[11px] text-zinc-600">Scan with Expo Go to run this app on your phone</p>
        </div>
      )}
    </div>
  );
}
