"""Incremental parser for the Build stage's streamed file-block format.

    <<<FILE path/to/file.js>>>
    ...full contents...
    <<<END>>>
    <<<DELETE path/to/file.js>>>

Groq can't stream structured outputs, so Build streams this plain-text format
and we parse it chunk by chunk, emitting events the frontend can apply live.
Markers may be split across chunk boundaries.
"""
import re
from dataclasses import dataclass

OPEN_RE = re.compile(r"<<<(FILE|DELETE)\s+([^>\s]+)\s*>>>")
END = "<<<END>>>"
MARKER_START = "<<<"


@dataclass
class Event:
    kind: str  # "text" | "file_start" | "file_delta" | "file_end" | "delete"
    path: str = ""
    text: str = ""


def strip_fences(content: str) -> str:
    """Remove a markdown fence the model may wrap around a file despite instructions."""
    stripped = content.strip("\n")
    lines = stripped.split("\n")
    if len(lines) >= 2 and lines[0].lstrip().startswith("```") and lines[-1].strip() == "```":
        lines = lines[1:-1]
    return "\n".join(lines).strip("\n") + "\n"


class FileBlockParser:
    def __init__(self):
        self.buf = ""
        self.path: str | None = None  # file currently being written
        self.content: list[str] = []

    def feed(self, chunk: str) -> list[Event]:
        self.buf += chunk
        events: list[Event] = []
        while True:
            if self.path is None:
                m = OPEN_RE.search(self.buf)
                if m:
                    before = self.buf[: m.start()]
                    if before.strip():
                        events.append(Event("text", text=before))
                    kind, path = m.group(1), m.group(2)
                    self.buf = self.buf[m.end():]
                    if kind == "DELETE":
                        events.append(Event("delete", path=path))
                    else:
                        self.path, self.content = path, []
                        # Drop the newline right after the opening marker.
                        self.buf = self.buf.lstrip("\r").removeprefix("\n")
                        events.append(Event("file_start", path=path))
                    continue
                # No complete opener: flush whole lines of commentary that can't hold a marker.
                idx = self.buf.rfind(MARKER_START)
                safe = len(self.buf) - self._partial_suffix(self.buf, MARKER_START) if idx == -1 else idx
                safe = self.buf.rfind("\n", 0, safe) + 1
                if safe and self.buf[:safe].strip():
                    events.append(Event("text", text=self.buf[:safe]))
                self.buf = self.buf[safe:]
                return events
            # Inside a file block.
            end = self.buf.find(END)
            if end != -1:
                self._append(self.buf[:end], events)
                self.buf = self.buf[end + len(END):]
                events.append(Event("file_end", path=self.path, text=strip_fences("".join(self.content))))
                self.path = None
                continue
            # Keep a tail that might be the beginning of "<<<END>>>".
            keep = self._partial_suffix(self.buf, END)
            self._append(self.buf[: len(self.buf) - keep], events)
            self.buf = self.buf[len(self.buf) - keep:]
            return events

    def finish(self) -> list[Event]:
        """Flush at end of stream; an unterminated file block is closed gracefully."""
        events: list[Event] = []
        if self.path is not None:
            self._append(self.buf, events)
            events.append(Event("file_end", path=self.path, text=strip_fences("".join(self.content))))
            self.path = None
        elif self.buf.strip():
            events.append(Event("text", text=self.buf))
        self.buf = ""
        return events

    def _append(self, text: str, events: list[Event]):
        if text:
            self.content.append(text)
            events.append(Event("file_delta", path=self.path, text=text))

    @staticmethod
    def _partial_suffix(s: str, marker: str) -> int:
        for n in range(min(len(marker) - 1, len(s)), 0, -1):
            if s.endswith(marker[:n]):
                return n
        return 0
