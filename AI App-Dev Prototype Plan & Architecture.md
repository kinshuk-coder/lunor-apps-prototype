# Lunor Round 1 — AI App-Dev Prototype: Plan & Architecture

Sep 30, 2026 · 

## The brief

Build a deployed prototype of an AI tool that takes an app idea and walks the user through Prompt → Understand → Plan → Build → Explain → Learn. It is modelled on Lunor's existing web-development tool at lunor.online. Due **6 Oct 2026**; the submission form comes by email.

What Lunor stated they want:

- An AI-powered **app** development experience, not a web-page generator.
- More than "prompt → generated app": the user should come away understanding and able to learn.
- A working, deployed prototype.
- Every AI tool and technology used, listed in the submission.

What will likely separate entries: a real running preview of the generated app, visible planning before code, and explanations tied to the actual code. A pretty chat box that dumps code will look like everyone else's.

## Product: "Lunor Apps" — one idea, six stages

The user types one app idea and moves through six stages, each a tab with a clear output. The generated app is a **React Native (Expo) app shown running in a phone frame in the browser**, so judges see a real mobile app, not a mock-up.

1. **Prompt** — user types an idea ("a habit tracker for students with streaks"). Three example chips for a one-click demo.
2. **Understand** — the AI restates the idea, lists target users, core features (must / nice-to-have) and asks 2–3 clarifying questions with suggested answers the user can accept in one click.
3. **Plan** — a build plan the user can edit before any code: screens and navigation map, data model, components, and a numbered task list. The user approves it with one button.
4. **Build** — code is generated task by task, streaming into a file tree and editor; the app hot-reloads in the phone preview after each task. Errors from the preview are fed back to the AI to fix automatically (max 2 retries).
5. **Explain** — click any file, function or plan task to get a plain-English explanation tied to those exact lines, plus a "why this design" note.
6. **Learn** — generated from the user's own app: 3–5 concept cards (e.g. `useState`, navigation, AsyncStorage), a short quiz, and "try it yourself" challenges ("add a dark-mode toggle") that the AI checks.

The user can jump back at any time: edit the plan and rebuild only the changed tasks, or ask for a change in chat ("make streaks weekly").

## Architecture

&#91;embedded content: system architecture · browser, 5 AI stages, models and storage\]

The browser only renders; every AI call runs in FastAPI. Each stage returns validated JSON that the next stage consumes, and preview errors flow back to Build for up to two automatic fixes.

## Tech stack

Stick to what Kinshuk has already shipped (FastAPI, React, Render, Vercel) so the week goes into the product, not into learning tools.

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Next.js + React + Tailwind, Monaco editor | He knows React; Monaco gives a real code editor with file tabs |
| Live app preview | Expo Snack embed (React Native web preview + QR code for Expo Go) | Runs the generated mobile app in the browser with no build server; judges can also scan the QR code and open it on their own phone |
| Backend | FastAPI (Python), Server-Sent Events for streaming | His strongest stack; streaming makes the build stage feel live |
| AI orchestration | Plain Python pipeline of stage agents with Pydantic-validated JSON outputs (no heavy framework) | Easy to debug and explain in the interview; reuses the patterns from his coding agent |
| LLMs | A strong coding model for Plan and Build; a fast, cheap model for Understand, Explain and Learn | Speed where it's chat, quality where it's code |
| Storage | SQLite (projects, plans, files, quiz results) | Zero setup; enough for a prototype |
| Deployment | Vercel (frontend) + Render (FastAPI) | He has deployed to both already |

Open decision: which model provider. Pick the one he has API credits for, and keep the model name in one config file so it can be swapped.

## Build plan: 30 Sep → 6 Oct

A working end-to-end path by Friday, depth over the weekend, and Monday–Tuesday kept for polish and submission. If a day slips, cut from the "stretch" list below, never from deployment.

**Wed 30 Sep — skeleton**

- [ ] Explore lunor.online; note its look, flow and wording to mirror
- [ ] Repo: Next.js frontend + FastAPI backend, deploy both empty (Vercel + Render) on day one
- [ ] Expo Snack embed showing a hard-coded "Hello" app in a phone frame

**Thu 1 Oct — Understand + Plan**

- [ ] Understand agent: idea → JSON (summary, users, features, questions)
- [ ] Plan agent: spec → JSON (screens, navigation, data model, tasks)
- [ ] Plan screen: editable task list + screen map + "Approve plan" button

**Fri 2 Oct — Build (the core)**

- [ ] Build agent: one task → file changes (JSON: path + content), streamed over SSE
- [ ] File tree + Monaco editor; push files to the Snack preview after each task
- [ ] Error loop: preview error → fix prompt → retry (max 2)
- [ ] Milestone: idea → running app, end to end, on the deployed URL

**Sat 3 Oct — Explain**

- [ ] Select lines / file / task → explanation tied to that code
- [ ] "Why this design" notes linking plan tasks to the files they produced

**Sun 4 Oct — Learn**

- [ ] Concept cards generated from the concepts actually used in the code
- [ ] 5-question quiz + one "try it yourself" challenge checked by the AI

**Mon 5 Oct — polish + test**

- [ ] Test 5 different ideas end to end; fix the top failures
- [ ] Loading states, empty states, three example-idea chips for a one-click demo
- [ ] README with architecture diagram and the AI-tools list

**Tue 6 Oct — submit**

- [ ] Record a 2–3 minute demo video
- [ ] Final deploy check on a fresh browser, then submit before the deadline

Stretch (only if ahead): edit-in-chat changes that rebuild only affected files; export the project as a zip; share link for a generated app.

## Demo and submission

The demo video should show one idea going all the way from prompt to a running app and a quiz, in under 3 minutes.

1. (0:00) Type "a habit tracker for students with streaks" and hit go.
2. (0:20) Understand: accept the suggested answers to the clarifying questions.
3. (0:40) Plan: show the screen map, edit one task, approve.
4. (1:00) Build: files stream in; the app appears in the phone frame; show one auto-fixed error if it happens.
5. (1:50) Explain: click the streak function and read the explanation.
6. (2:20) Learn: open a concept card, answer one quiz question, show the "try it yourself" challenge.
7. (2:45) Scan the QR code on a real phone to open the same app.

Submission checklist:

- [ ] Live URL (frontend) that works in a fresh incognito window
- [ ] GitHub repo with README: what it does, architecture diagram, how to run locally
- [ ] Demo video link
- [ ] AI tools list: every model and API used in the product, plus every AI tool used while building (e.g. coding assistants), stated honestly
- [ ] API keys only in environment variables, never in the repo

## Risks and fallbacks

| Risk | Fallback |
| --- | --- |
| Generated code doesn't run in the preview | Constrain Build to a fixed Expo template + an allow-list of libraries; the error-fix loop; keep a cached "golden" demo project for the video |
| Snack embed limits or breaks | Fall back to a React (web) preview in an iframe styled as a phone; say so in the README |
| LLM output breaks the JSON shape | Pydantic validation + one automatic re-ask with the validation error |
| Slow or costly model calls during judging | Cache results per idea; fast model for the chat-like stages; rate-limit per session |
| Running out of days | Cut Learn's challenge checker first, then Explain's "why this design"; never cut deploy or the demo video |
