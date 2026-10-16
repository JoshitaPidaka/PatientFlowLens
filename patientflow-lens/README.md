# PatientFlow Lens

**DATATHON 2026 · Track 1 · Health: "The Forgotten Patient"**

A hospital-flow product that answers *"What is likely to get delayed next, why, and what should the operations team examine?"*. It also gives doctors a timetable built from patient bookings and gives patients honest wait times.

> Synthetic DATATHON data. Not for clinical decisions. Doctors, rosters and appointment slots are **simulated** from the provided data (see [Data honesty](#data-honesty)).

![Overview](docs/screenshots/overview.png)

---

## Quick start

```bash
make install      # pip + npm
make bootstrap    # clean data → train 6 models → simulate scheduling layer → alerts  (~10 s)
make run          # build frontend and serve everything on http://localhost:8000
```

Or with Docker: `docker compose up --build`, then open http://localhost:8000.

| Command | What it does |
|---|---|
| `make test` | 37 integration tests on a throwaway database (data invariants, no-leakage, model ≥ baseline, booking rules, waitlist, doctor workflow, leave, alerts, PDF) |
| `make api` / `make web` | Dev mode: API on :8000 and Vite on :5173 (hot reload) |
| http://localhost:8000/docs | Interactive OpenAPI docs for all 67 API operations |

**Demo clock.** The scheduling layer runs on **Mon 5 Jan 2026, 10:30**, the first working week after the 2025 data ends. Use **+15 min** in the top bar to move time forward, and the reset button to go back.

---

## Five workspaces (role switcher in the sidebar)

| Workspace | User (from the brief) | Highlights |
|---|---|---|
| 🏥 **Operations** | Hospital operations managers | Daily briefing, KPI tiles, department × triage heatmap, patient-flow river, **Investigate-first queue** (impact × confidence), **Alerts & actions** (kanban, evidence rows, assign / escalate / resolve, audit trail, rule builder), **Roster & appointments** (coverage heatmap, optimizer, leave approvals with auto-reschedule), forecasts, what-if simulator, fair-wait audit, weekly PDF |
| 🧭 **Department** | Department coordinators | Today's sessions board (move patients, call in, no-show), **time-machine Live Board** (replay any real 2025 day minute by minute), my department vs peers, patient journey timelines, **wait estimator** with exact explanation |
| 🧪 **Diagnostics** | Service administrators | Turnaround monitor, **urgent-priority breach** detection, turnaround targets that raise alerts, demand heatmap, support-service scorecard |
| 🩺 **Doctor** | Extension | **Weekly timetable built from patient appointments**, today's queue with one-tap call-in / complete / no-show, automatic running-late notices, next-patient brief and history, leave requests with impact preview, stats |
| 🙂 **Patient** | Extension | Find a doctor (language filter, weekly availability), 3-step booking with a **smart slot picker**, waitlist with automatic slot offers, reschedule / cancel, self check-in, **live wait ticket**, follow-up prompts, feedback. **English / हिन्दी / తెలుగు** |

Shared: Data Trust Centre, Model Card, ⌘K command palette, dark mode, notifications, waiting-room TV board (`/waitboard`).

### Brief coverage

| Brief item | Where |
|---|---|
| B1 Patient-flow dashboard with department queues & waits | Operations overview, Live Board, Sessions board, Journeys |
| B2 Forecast of demand / delays by department & period | Forecasts, Wait estimator, booking estimates |
| B3 Alerts for unusual waits / overloaded services | Alerts & actions (EWMA + IsolationForest, rules, running-late, coverage gaps) |
| B4 Diagnostic-test turnaround monitor | Diagnostics workspace |
| B5 "What should we investigate first?" ranked by impact & confidence | Investigate first |
| B6 Explanation panel for each alert | "Why?" drawer, waterfall explanations, evidence rows on every alert |

---

## Machine learning (all trained from scratch, no API keys, no pretrained models)

Time-aware split: **train Jan–Sep 2025, test Oct–Dec 2025**. Features use only information known at arrival, and history features look backwards only (tested).

| Model | Method | Test result |
|---|---|---|
| **Wait time** (production) | Ridge regression, one-hot + scaled | **MAE 13.8 min, R² 0.52** vs naive 20.1 min. Split-conformal 80% interval covers **80%** of test visits |
| Wait time (challenger) | HistGradientBoosting | MAE 14.2. No gain, so no hidden non-linear signal; Ridge kept because it is exactly explainable |
| Unusual weeks | EWMA control chart on weekly residuals + IsolationForest | Confidence High when both agree |
| Demand forecast | Poisson regression (department + seasonal Fourier terms) | Rolling backtest MAE 2.75 vs naive 2.91 visits/week |
| Visit-pattern clusters | K-means, k by silhouette | k = 5 |
| Consult duration | Ridge vs department median | Ridge does **not** beat the median, so the median is used (honest choice) |
| Investigate-first ranking | Triage-adjusted excess × volume, 95% CI | Pediatrics +8.6 min, Laboratory +7.6, Outpatient +6.4 (high confidence) |

Deliberately **not** built: a no-show model, because those events are simulated and a model would only learn our assumptions.

Key findings shown in the product: triage explains about half of wait variation. **Urgent tests are not faster than routine ones (57 vs 58 min).** There is no time-of-day, weekday, age, sex or insurance effect, and the fair-wait audit confirms it.

---

## Data honesty

**No rows are dropped.** Each data-quality check is stored as a `dq_*` flag and shown in the Data Trust Centre. For example: 4,998 / 5,000 test timestamps fall outside their visit, so test turnaround is analysed on its own. `daily_capacity` is not on the same scale as volume, so no utilization metric is computed from it.

The dataset has **no doctors, rosters or appointment slots**. `backend/app/etl/simulate.py` generates them deterministically (seed 2026), anchored to real columns:

| Item | Rule |
|---|---|
| Doctors (48) + 4 service desks | `clamp(ceil(staff_count/4), 3, 7)` per department |
| Rota | 24/7, three shifts (scheduled visits arrive at every hour in the data) |
| Slot length | department median `service_minutes` (real) |
| Walk-in reserve | every 3rd slot (walk-in + emergency ≈ 50% of real visits) |
| Historical appointments | the **4,008 real Scheduled + Follow-up encounters**; waits / times / outcomes are real |
| Cancellations, no-shows, lead times, demo-week bookings, languages | assumptions, labelled "Simulated" in the UI |

---

## Architecture

```
backend/   FastAPI · SQLModel (SQLite) · pandas · scikit-learn · reportlab
  app/etl/        clean.py (dq flags, backward-looking features) · simulate.py (gap-filling layer)
  app/ml/         train.py (6 models + metrics.json) · wait_model.py (conformal intervals, exact explanations)
  app/services/   analytics · live replay · scheduling (booking, waitlist, running-late, leave, coverage, optimizer) · alerts · reports
  app/api/        routes.py (/api/v1, 67 operations)
  tests/          37 integration tests
frontend/  React 18 · TypeScript · Vite · Tailwind · TanStack Query · Recharts · Framer Motion · cmdk
  src/pages/      command · department · diagnostics · doctor · patient · shared
```

The API serves the built frontend, so the whole product is one deployable unit.

## 4-minute demo script

1. **Operations → Overview**: the briefing names Pediatrics; open *Why?* to see it is slower at all 4 triage levels.
2. **Department → Live Board**: replay a real day; a waiting card turns amber when it passes the model's expected wait.
3. **Wait estimator**: Low-triage Pediatrics walk-in = 80 min (+22.9 triage, +12.2 department).
4. **Diagnostics**: urgent-priority breach; set a 30-min target for urgent blood tests and the breaches become alerts.
5. **Patient P01936**: switch to Telugu, check in, see the live ticket (doctor running ~22 min late), then book Cardiology with a ⭐ recommended slot.
6. **Doctor (Dr. Meera Kulkarni)**: the timetable shows the bookings; Complete → Call in and the patient's ticket updates.
7. **Operations → Roster**: approve a leave request; patients move to colleagues (language match first) and are notified.
8. **Alerts**: assign the Pediatrics bottleneck, then close on the **Data Trust Centre** and **Model Card**.

## Disclosures

Data: DATATHON Track 1 pack only (plus the simulated layer above). Libraries as listed. No external AI services or pretrained models. Code was developed with an AI coding assistant (Claude) and reviewed by the team.
