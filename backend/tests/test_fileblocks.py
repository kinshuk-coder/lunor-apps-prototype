from app.agents.fileblocks import FileBlockParser, strip_fences

SAMPLE = (
    "Setting up navigation.\n"
    "<<<FILE App.js>>>\nimport React from 'react';\nexport default function App() { return null; }\n<<<END>>>\n"
    "<<<FILE screens/HomeScreen.js>>>\nconst a = '<<<not a marker';\n<<<END>>>\n"
    "<<<DELETE old.js>>>\n"
)


def run(chunks):
    p = FileBlockParser()
    events = []
    for c in chunks:
        events += p.feed(c)
    events += p.finish()
    return events


def files_of(events):
    return {e.path: e.text for e in events if e.kind == "file_end"}


def test_whole_stream():
    ev = run([SAMPLE])
    files = files_of(ev)
    assert files["App.js"].startswith("import React")
    assert files["screens/HomeScreen.js"] == "const a = '<<<not a marker';\n"
    assert any(e.kind == "delete" and e.path == "old.js" for e in ev)
    assert ev[0].kind == "text" and "navigation" in ev[0].text


def test_every_chunk_boundary_gives_same_result():
    expected = files_of(run([SAMPLE]))
    for size in (1, 2, 3, 5, 7, 13):
        chunks = [SAMPLE[i:i + size] for i in range(0, len(SAMPLE), size)]
        ev = run(chunks)
        assert files_of(ev) == expected, size
        # Deltas reassemble to the final content (modulo the fence/newline normalisation).
        deltas = "".join(e.text for e in ev if e.kind == "file_delta" and e.path == "App.js")
        assert deltas.strip() == expected["App.js"].strip()
        assert any(e.kind == "delete" for e in ev)


def test_commentary_is_emitted_as_whole_lines():
    text = "Adding the home screen now.\n<<<FILE a.js>>>\nx\n<<<END>>>"
    ev = run([text[i:i + 3] for i in range(0, len(text), 3)])
    notes = [e.text for e in ev if e.kind == "text"]
    assert notes == ["Adding the home screen now.\n"]


def test_missing_end_is_closed_on_finish():
    files = files_of(run(["<<<FILE App.js>>>\nconst x = 1;\n"]))
    assert files == {"App.js": "const x = 1;\n"}


def test_fences_are_stripped():
    assert strip_fences("```javascript\nconst x = 1;\n```\n") == "const x = 1;\n"
    files = files_of(run(["<<<FILE a.js>>>\n```js\nlet y;\n```\n<<<END>>>"]))
    assert files["a.js"] == "let y;\n"


def test_files_block_outlines_unfocused_files_when_large():
    from app.agents import common

    big = "import React from 'react';\nexport default function Big() {\n" + "  const x = 1;\n" * 2000 + "}\n"
    files = {"App.js": "import X from './X';\n", "screens/Big.js": big, "screens/Task.js": "const t = 1;\n"}
    out = common.files_block(files, focus={"screens/Task.js", "App.js"})
    assert "### screens/Big.js (outline only" in out
    assert "export default function Big()" in out and "const x = 1;" not in out
    assert "const t = 1;" in out
    # Small projects are always sent in full.
    small = {"a.js": "const a = 1;\n", "b.js": "const b = 2;\n"}
    assert "outline only" not in common.files_block(small, focus={"a.js"})


def test_mentioned_files():
    from app.agents.common import mentioned_files

    files = {"App.js": "", "screens/TimerScreen.js": "", "storage.js": ""}
    assert mentioned_files(files, "TypeError in TimerScreen (screens/TimerScreen.js:12)") == {"screens/TimerScreen.js"}
