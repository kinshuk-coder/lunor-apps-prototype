import os
import tempfile

os.environ["DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")

from fastapi.testclient import TestClient  # noqa: E402

from app import main  # noqa: E402
from app.main import app, safe_path  # noqa: E402

client = TestClient(app)


def test_create_and_get_project():
    r = client.post("/projects", json={"idea": "a habit tracker"})
    pid = r.json()["id"]
    p = client.get(f"/projects/{pid}").json()
    assert p["idea"] == "a habit tracker"
    assert "App.js" in p["files"]


def test_build_requires_approved_plan():
    pid = client.post("/projects", json={"idea": "a todo app"}).json()["id"]
    assert client.post(f"/projects/{pid}/build").status_code == 400


def test_plan_edit_marks_changed_tasks_for_rebuild():
    pid = client.post("/projects", json={"idea": "notes"}).json()["id"]
    plan = {"screens": [], "navigation": [], "data_model": [],
            "tasks": [{"id": 1, "title": "a", "description": "d", "files": ["App.js"]},
                      {"id": 2, "title": "b", "description": "d", "files": ["x.js"]}]}
    main.db.update_project(pid, plan=plan, plan_approved=1, built_task_ids=[1, 2])
    plan["tasks"][1]["title"] = "b changed"
    r = client.put(f"/projects/{pid}/plan", json=plan).json()
    assert r["built_task_ids"] == [1]


def test_safe_path():
    assert safe_path("screens/Home.js") == "screens/Home.js"
    assert safe_path("/App.js") == "App.js"
    assert safe_path("../etc/passwd.js") is None
    assert safe_path("evil.sh") is None
    assert safe_path("package.json") is None
