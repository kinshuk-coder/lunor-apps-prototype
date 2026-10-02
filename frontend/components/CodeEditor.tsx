"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";

export type Selection = { start: number; end: number };
export type Highlight = { start: number; end: number; note?: string };

type Props = {
  path: string;
  value: string;
  readOnly?: boolean;
  highlights?: Highlight[];
  onChange?: (value: string) => void;
  onSelect?: (sel: Selection | null) => void;
  followTail?: boolean; // keep scrolled to the bottom while streaming
};

export default function CodeEditor({ path, value, readOnly, highlights, onChange, onSelect, followTail }: Props) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const decorations = useRef<any>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    decorations.current = editor.createDecorationsCollection([]);
    editor.onDidChangeCursorSelection((e) => {
      const s = e.selection;
      if (s.isEmpty()) onSelectRef.current?.(null);
      else onSelectRef.current?.({ start: s.startLineNumber, end: s.endLineNumber });
    });
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !decorations.current) return;
    decorations.current.set(
      (highlights ?? []).map((h) => ({
        range: { startLineNumber: h.start, startColumn: 1, endLineNumber: h.end, endColumn: 1 },
        options: { isWholeLine: true, className: "lunor-highlight", hoverMessage: h.note ? { value: h.note } : undefined },
      })),
    );
    if (highlights?.length) editor.revealLineInCenter(highlights[0].start);
  }, [highlights, path]);

  useEffect(() => {
    if (followTail && editorRef.current) {
      const lines = value.split("\n").length;
      editorRef.current.revealLine(lines);
    }
  }, [value, followTail]);

  const language = path.endsWith(".json") ? "json" : "javascript";
  return (
    <Editor
      path={path}
      value={value}
      language={language}
      theme="vs-dark"
      onMount={onMount}
      onChange={(v) => onChange?.(v ?? "")}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 13,
        scrollBeyondLastLine: false,
        wordWrap: "on",
        automaticLayout: true,
        padding: { top: 12 },
        stickyScroll: { enabled: false },
      }}
    />
  );
}
