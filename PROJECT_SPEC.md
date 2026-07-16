# LLM Pipeline Profiler — Project Spec

## 1. What this project is

A profiling system for LLM inference/training pipelines run on Kaggle notebooks
(no local GPU required). It has four parts:

1. **profiler-lib** — a Python package imported inside the Kaggle notebook that
   instruments each pipeline stage (model load, tokenize, generate, etc.) and
   records timing, CPU/RAM, GPU memory/utilization, and op-level GPU traces.
2. **sampler-cpp** — an optional high-frequency C++ system sampler (NVML + /proc)
   exposed to Python via pybind11, used when Python-loop sampling overhead would
   skew measurements.
3. **dashboard** — a Next.js app (API routes + UI) that ingests run data (via
   file upload or live HTTP POST from the notebook) and visualizes it: stage
   timeline, memory-over-time chart, throughput chart, flamegraph of GPU ops,
   and run-to-run comparison.
4. **chrome-extension** — an optional thin add-on that scrapes Kaggle's own
   visible resource sidebar (RAM/GPU/disk meters) and forwards them to the
   dashboard, plus a popup shortcut to open the matching dashboard run.

Build order (always keep something demoable):
schema → tracer + collectors → example notebook → static dashboard reading a
JSON file → upload API route → live POST mode → C++ sampler → Chrome extension.

---

## 2. Full file structure

```
llm-pipeline-profiler/
│
├── profiler-lib/
│   ├── pyproject.toml
│   ├── README.md
│   └── llm_profiler/
│       ├── __init__.py
│       ├── tracer.py
│       ├── schema.py
│       ├── exporter.py
│       ├── sampler_bridge.py
│       └── collectors/
│           ├── cpu_mem.py
│           ├── gpu.py
│           └── torch_profiler.py
│
├── sampler-cpp/
│   ├── CMakeLists.txt
│   ├── src/
│   │   ├── main.cpp
│   │   ├── nvml_reader.cpp
│   │   ├── nvml_reader.h
│   │   ├── proc_reader.cpp
│   │   ├── proc_reader.h
│   │   ├── ipc_server.cpp
│   │   └── ipc_server.h
│   └── bindings/
│       └── pybind_wrapper.cpp
│
├── dashboard/
│   ├── package.json
│   ├── next.config.js
│   ├── prisma/
│   │   └── schema.prisma
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── api/
│       │   │   ├── runs/route.ts
│       │   │   ├── runs/[id]/route.ts
│       │   │   └── stream/route.ts
│       │   └── dashboard/
│       │       ├── page.tsx
│       │       └── [runId]/page.tsx
│       ├── components/
│       │   ├── Timeline.tsx
│       │   ├── Flamegraph.tsx
│       │   ├── MemoryChart.tsx
│       │   ├── ThroughputChart.tsx
│       │   └── RunCompareTable.tsx
│       ├── lib/
│       │   ├── db.ts
│       │   └── parseTrace.ts
│       └── types/
│           └── run.ts
│
├── chrome-extension/
│   ├── manifest.json
│   ├── content_script.js
│   ├── background.js
│   └── popup/
│       ├── popup.html
│       └── popup.js
│
├── examples/
│   └── kaggle_notebook_example.ipynb
│
└── docker-compose.yml
```

---

## 3. Shared data contract (build this first, everything else depends on it)

`Run`:
- `id`, `name`, `created_at`, `model_name`, `hardware_info` (GPU type, VRAM, CPU count)
- `stages: Stage[]`

`Stage`:
- `id`, `run_id`, `name` (e.g. "model_load", "tokenize", "generate", "postprocess")
- `start_time`, `end_time`, `duration_ms`
- `cpu_percent`, `ram_used_mb`
- `gpu_util_percent`, `gpu_mem_used_mb`
- `metrics: Metric[]` (arbitrary key/value, e.g. tokens_generated, batch_size)
- `trace_ref` (optional pointer to a chrome-trace JSON blob for op-level detail)

`Metric`:
- `timestamp`, `key`, `value` (for time-series data within a stage, e.g. memory sampled every 50ms)

Implement this identically in `profiler-lib/llm_profiler/schema.py` (pydantic)
and `dashboard/src/types/run.ts` (TypeScript interfaces) and
`dashboard/prisma/schema.prisma` (DB tables) so the three layers never drift.

---

## 4. profiler-lib — what to build

- `tracer.py`: `Tracer` class with `.stage(name)` context manager (also usable
  as a decorator). On enter: record start time + CPU/GPU snapshot. On exit:
  record end time + snapshot, compute deltas, append a `Stage` object.
- `collectors/cpu_mem.py`: wraps `psutil.Process().memory_info()` and
  `psutil.cpu_percent()`.
- `collectors/gpu.py`: wraps `pynvml` (`nvmlDeviceGetMemoryInfo`,
  `nvmlDeviceGetUtilizationRates`). Must degrade gracefully (no-op) if no GPU
  or `pynvml` unavailable, since Kaggle sessions can be CPU-only.
- `collectors/torch_profiler.py`: wraps `torch.profiler.profile(...)` around a
  stage when requested, exports its native chrome-trace JSON for the
  Flamegraph component to consume directly.
- `sampler_bridge.py`: connects to the C++ sampler's Unix domain socket if
  present; falls back to pure-Python sampling if the socket isn't running.
- `exporter.py`: serializes the `Run` to `run.json` in `/kaggle/working/`, and
  optionally POSTs each finished `Stage` to `{DASHBOARD_URL}/api/runs` if an
  env var / config flag enables live mode.
- Package it so Kaggle usage is exactly:
  ```python
  !pip install llm-profiler
  from llm_profiler import Tracer
  tracer = Tracer(run_name="llama3-8b-inference", dashboard_url=None)  # None = offline mode
  ```

---

## 5. sampler-cpp — what to build (optional, do last)

- `main.cpp`: loop polling NVML + `/proc/self/status` + `/proc/stat` every
  ~10ms, pushes samples over a Unix domain socket (`ipc_server.cpp`).
- `pybind_wrapper.cpp`: exposes a `start_sampler()` / `read_samples()` API to
  Python so `sampler_bridge.py` can consume it transparently.
- Build with CMake; ship as a Python extension module via pybind11 so it
  installs alongside `profiler-lib` with no separate manual build step for
  the end user (or at least document `pip install .` building it).
- This component is a "nice-to-have resume signal" — do not block the rest
  of the project on it.

---

## 6. dashboard (Next.js) — what to build

- `api/runs/route.ts` (POST): validate incoming payload against the shared
  schema, write to DB via Prisma.
- `api/runs/[id]/route.ts` (GET): fetch one run + all its stages/metrics.
- `api/stream/route.ts`: Server-Sent Events endpoint so the dashboard can show
  a run updating live while the Kaggle notebook is still executing.
- `dashboard/page.tsx`: list of past runs + "compare" selection.
- `dashboard/[runId]/page.tsx`: full detail view for one run.
- `components/Timeline.tsx`: Gantt-style horizontal bars, one per stage,
  proportional to duration.
- `components/Flamegraph.tsx`: renders the chrome-trace JSON from
  `torch_profiler.py` (can use an existing trace-viewer approach or a custom
  D3/recharts flamegraph).
- `components/MemoryChart.tsx` / `ThroughputChart.tsx`: recharts line charts
  over the `Metric` time series.
- `components/RunCompareTable.tsx`: side-by-side diff of two runs' stage
  durations and peak memory, to demonstrate "found the bottleneck."
- Use **Postgres** via Prisma for the dashboard's own storage (chosen over
  SQLite for this project: handles concurrent writes correctly when live-POST
  mode is streaming stage updates while a dashboard is open for viewing, and
  it's the stack actually used in ML infra roles — worth naming explicitly in
  the README/resume). Index `Metric` on `(stage_id, timestamp)` and `Stage`
  on `run_id`, since queries are almost always "give me the time series for
  this run" — this indexing choice is itself worth a sentence in an
  interview.
- Run Postgres via `docker-compose.yml` (Section 9) so local setup is still
  one command — `docker compose up` should bring up both `dashboard` and
  `db` with no manual DB install.

---

## 7. chrome-extension — what to build (optional, do last)

- `content_script.js`: reads Kaggle's existing visible resource meters (RAM/
  GPU/disk bars already rendered in the notebook UI sidebar) via DOM
  selectors, sends scraped values to `background.js`.
- `background.js`: forwards scraped stats to the dashboard's `/api/runs`
  endpoint, tagged with the Kaggle notebook URL/slug.
- `popup/popup.js`: shows a button that deep-links to the matching dashboard
  run for the currently open Kaggle notebook tab.
- MV3 manifest, minimal permissions (`activeTab`, host permission for
  `kaggle.com`).

---

## 8. examples/kaggle_notebook_example.ipynb

A minimal working notebook: install `profiler-lib`, load a small HF model,
wrap `model_load`, `tokenize`, `generate`, `postprocess` stages in
`tracer.stage(...)`, call `tracer.export()`, show the resulting `run.json`.
This is what proves the whole pipeline works and is what you'd screen-record
for a resume/portfolio demo.

---

## 9. docker-compose.yml

Two services: `dashboard` (Next.js) and `db` (Postgres). Include a named
volume for `db` so data persists across restarts, and have `dashboard`
depend on `db` with a healthcheck.

Migration strategy:
- **Local development:** do NOT auto-run migrations on container start. Run
  `npx prisma migrate dev` manually from the host (or `docker compose exec
  dashboard npx prisma migrate dev`) whenever the schema changes. This keeps
  you in control while `schema.prisma` is still actively changing early on.
- **Production/staging (future work):** switch to `npx prisma migrate deploy`
  run automatically as a startup/init step (e.g. container entrypoint or CI/CD
  release step) once the schema has stabilized. Document this distinction
  explicitly in the README — it's a real deployment practice worth naming on
  a resume ("manual migrations in dev, automated `migrate deploy` in CI/CD").

Purpose of the compose file overall: one-command local demo setup — good for
a README "Getting Started" section and for anyone reviewing the project.

---

## 10. Non-negotiable constraints for whoever builds this

- Kaggle kernels do not expose inbound ports — never design a flow that
  assumes something can connect *into* a running Kaggle kernel. Data only
  flows *out* (via file export or outbound HTTP POST).
- All GPU/CPU collectors must fail gracefully when hardware isn't present
  (e.g., Kaggle CPU-only sessions) — no hard crashes, just empty/zero metrics.
- Keep the shared schema (Section 3) as the single source of truth; changes
  there must be mirrored in all three consuming layers in the same change.
