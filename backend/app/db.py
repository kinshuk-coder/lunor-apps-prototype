"""SQLite storage: projects (stage outputs as JSON), generated files, LLM cache."""
import hashlib
import json
import sqlite3
import time
import uuid
from contextlib import contextmanager

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    idea TEXT NOT NULL,
    created_at REAL NOT NULL,
    understand TEXT,
    answers TEXT,
    plan TEXT,
    plan_approved INTEGER NOT NULL DEFAULT 0,
    built_task_ids TEXT NOT NULL DEFAULT '[]',
    learn TEXT,
    quiz TEXT
);
CREATE TABLE IF NOT EXISTS files (
    project_id TEXT NOT NULL,
    path TEXT NOT NULL,
    content TEXT NOT NULL,
    PRIMARY KEY (project_id, path)
);
CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at REAL NOT NULL
);
"""

JSON_COLUMNS = {"understand", "answers", "plan", "built_task_ids", "learn", "quiz"}


@contextmanager
def conn():
    c = sqlite3.connect(config.DB_PATH)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init():
    with conn() as c:
        c.executescript(SCHEMA)


def create_project(idea: str) -> str:
    pid = uuid.uuid4().hex[:12]
    with conn() as c:
        c.execute("INSERT INTO projects (id, idea, created_at) VALUES (?, ?, ?)", (pid, idea, time.time()))
    return pid


def get_project(pid: str) -> dict | None:
    with conn() as c:
        row = c.execute("SELECT * FROM projects WHERE id = ?", (pid,)).fetchone()
    if row is None:
        return None
    out = dict(row)
    for k in JSON_COLUMNS:
        if out.get(k) is not None:
            out[k] = json.loads(out[k])
    out["plan_approved"] = bool(out["plan_approved"])
    return out


def update_project(pid: str, **fields):
    cols, vals = [], []
    for k, v in fields.items():
        cols.append(f"{k} = ?")
        vals.append(json.dumps(v) if k in JSON_COLUMNS and v is not None else v)
    with conn() as c:
        c.execute(f"UPDATE projects SET {', '.join(cols)} WHERE id = ?", (*vals, pid))


def get_files(pid: str) -> dict[str, str]:
    with conn() as c:
        rows = c.execute("SELECT path, content FROM files WHERE project_id = ? ORDER BY path", (pid,)).fetchall()
    return {r["path"]: r["content"] for r in rows}


def put_file(pid: str, path: str, content: str):
    with conn() as c:
        c.execute(
            "INSERT INTO files (project_id, path, content) VALUES (?, ?, ?) "
            "ON CONFLICT(project_id, path) DO UPDATE SET content = excluded.content",
            (pid, path, content),
        )


def delete_file(pid: str, path: str):
    with conn() as c:
        c.execute("DELETE FROM files WHERE project_id = ? AND path = ?", (pid, path))


def cache_key(*parts) -> str:
    return hashlib.sha256(json.dumps(parts, sort_keys=True, default=str).encode()).hexdigest()


def cache_get(key: str):
    with conn() as c:
        row = c.execute("SELECT value FROM cache WHERE key = ?", (key,)).fetchone()
    return json.loads(row["value"]) if row else None


def cache_put(key: str, value):
    with conn() as c:
        c.execute(
            "INSERT OR REPLACE INTO cache (key, value, created_at) VALUES (?, ?, ?)",
            (key, json.dumps(value), time.time()),
        )
