# ServiNexa — ML → LLM Migration Report (GPT-OSS 20B via GroqCloud)

> Goal: no trained ML models anywhere. Every AI feature is LLM orchestration against **GPT-OSS 20B** on **GroqCloud** (OpenAI-compatible API, free tier), with the existing **stub fallback preserved**.

---

## 🔑 Executive finding (read first)

**There is nothing to delete.** A full-codebase search found:

- `ai-service/` (FastAPI, `models/train_model.py`, `services/predictor.py`, `services/anomaly_detector.py`, `services/llm_client.py`, routers, schemas, tests, `requirements.txt`, `Dockerfile`, `railway.toml`) — **every file is 0 bytes.** The Python AI service is unbuilt.
- `grep` for `xgboost | sklearn | scikit | tensorflow | torch | joblib | pickle | scipy | numpy | .pkl | .joblib` across all `.ts/.py/.txt/.json/.toml` → **zero matches.** No ML code, no model artifacts, no ML deps declared.
- The only AI that exists is **TypeScript rule-based stubs** (`src/ai-stubs/*.stub.ts`) + the Express `ai-client.ts` (live-first, stub-fallback).

So "remove all ML" is already true in code. XGBoost/sklearn/Z-score only appear in the **architecture docs** (`DQBH Architecture.html`, the backend PDF) as a *plan*. This report therefore:
1. **Abandons** that planned XGBoost/scipy service.
2. **Builds the `ai-service/` LLM-only** from scratch (Python FastAPI + Groq).
3. **Keeps** the TS stubs unchanged as the offline fallback (they are not ML — pure heuristics).
4. **Keeps** `src/services/ai-client.ts` unchanged — its live-first/stub-fallback contract is exactly what we want.

---

## PHASE 1 — Inventory

### 1.1 ML files / model artifacts / preprocessing / datasets
| Found | Status |
|---|---|
| Trained models (`.pkl/.joblib/.h5/.pt`) | **None exist** |
| `ai-service/models/train_model.py` | Empty (0 B) → will be **deleted** (no training in LLM arch) |
| `ai-service/services/predictor.py`, `anomaly_detector.py` | Empty → **repurpose** as LLM feature services |
| Dataset files (AI4I 2020 CSV) | Not present in repo (`ai-service/data/` empty) → used only as **prompt context constants**, not a file dependency |

### 1.2 ML imports
**None.** No `sklearn`, `xgboost`, `tensorflow`, `torch`, `scipy.stats`, `numpy` ML inference, `joblib`/`pickle` anywhere.

### 1.3 Endpoints that "use ML inference" (today they call the unbuilt Python service, else fall back to TS stubs)
| Express route | File:line | Calls live path | Stub fallback |
|---|---|---|---|
| `POST /api/ai/classify` | `src/routes/ai.routes.ts:16` | `POST {AI}/ai/classify-request` (`:27`) | `classifyStub` (`:34`) |
| `POST /api/ai/predict` | `src/routes/ai.routes.ts:47` | `POST {AI}/ai/predict-health` (`:78`) | `predictStub` (`:89`) |
| `POST /api/ai/match` | `src/routes/ai.routes.ts:106` | `POST {AI}/ai/match-technician` (`:157`) | `matchStub` (`:164`) |
| `POST /api/ai/anomalies` | `src/routes/ai.routes.ts:176` | `POST {AI}/ai/detect-anomalies` (`:198`) | inline empty (`:206`) |

`{AI}` = `AI_SERVICE_URL` (`src/config/ai-service.ts`), default `http://localhost:8000`, timeout `AI_TIMEOUT_MS=5000`.

### 1.4 Stub files & interfaces (these define the exact contracts the LLM MUST return)
| Stub | Input | Output interface (LLM must match) |
|---|---|---|
| `src/ai-stubs/classify.stub.ts` | `description: string` | `{ category, priority, confidence, reasoning }` — category ∈ MECHANICAL/ELECTRICAL/HYDRAULIC/PNEUMATIC/SOFTWARE/CALIBRATION/SAFETY/PREVENTIVE/OTHER; priority ∈ CRITICAL/HIGH/MEDIUM/LOW |
| `src/ai-stubs/predict.stub.ts` | `{ air_temp, process_temp, rotational_speed, torque, tool_wear }` | `{ failure_probability: number(0-1), risk_level: LOW/MEDIUM/HIGH/CRITICAL, failure_modes: {mode,probability}[], recommended_action }` |
| `src/ai-stubs/match.stub.ts` | `(technicians[], request)` | `{ ranked_technicians: { technician_id, score(0-100), reasoning }[] }` |
| anomalies (inline, `ai.routes.ts:206`) | `{ service_requests[] }` | `{ anomalies: [], summary }` |

### 1.5 ML in configs
- `requirements.txt` (root + ai-service) — empty. `package.json` — no ML deps (good). `ai-service/Dockerfile`, `railway.toml` — empty.
- Env: only `AI_SERVICE_URL`. **No `GROQ_*` yet** → add in Phase 4.

### 1.6 AI service architecture (target)
```
Express (src/routes/ai.routes.ts)
   │  callAIService<T>(path, payload)  [live-first, 5s timeout]
   ▼
FastAPI ai-service  ──►  GroqCloud  (openai/gpt-oss-20b, OpenAI-compatible /chat/completions)
   │  (per-endpoint prompt + JSON-mode parse)
   └─ on Groq error/ratelimit/malformed JSON → 5xx → Express falls back to TS stub
```
The switching logic already exists and needs **no change**: `ai-client.ts` returns `source:'ai'` on 2xx, `source:'stub'` on any failure.

---

## PHASE 2 — LLM replacement strategy per feature

> Rule for all: **output JSON must match the stub interface byte-for-byte** (plus additive fields are OK). Every endpoint uses Groq JSON mode + a strict schema, and on any failure the Express stub answers.

| Feature | Was (planned) | LLM role | Endpoint | Chained? | Cacheable |
|---|---|---|---|---|---|
| Classification | LLM (planned) / TS stub (now) | Maintenance intake triage expert | `/ai/classify-request` | no | by normalized-desc hash, 1h |
| Predictive maintenance | XGBoost (abandoned) | Industrial diagnostics expert | `/ai/predict-health` | no | by sensor-vector hash, 10 min |
| Technician matching | weighted score (TS) | Workforce optimization expert | `/ai/match-technician` | no | no (context changes) |
| Anomaly detection | Z-score/IQR (abandoned) | Operations analyst | `/ai/detect-anomalies` | no | by (site,window) hash, 10 min |
| Cascading impact (NEW) | — | Production systems analyst | `/ai/impact-analyze` | **yes (2-step)** | by machine+graph hash, 5 min |
| Bid scoring (NEW) | — | Procurement/evaluation expert | `/ai/score-bids` | no | no |
| Parts availability (NEW) | — | Supply-chain analyst | `/ai/parts-sourcing` | no | by parts+inventory hash, 5 min |
| Knowledge matching (NEW) | — | Knowledge-management expert | `/ai/knowledge-match` | no | by (category,machine_type) hash, 1h |

**Classification — already LLM in plan?** In *code* it's the TS keyword stub today; there is no LLM call yet. Phase 5 provides the production prompt. (Additive: also return `sub_category`, e.g. `BEARING_THERMAL`, to drive the 3D-highlight feature — see `docs/INTEGRATION_REPORT.md`.)

**Predictive maintenance — statistical context instead of a model.** We inject the **AI4I 2020 baselines as constants in the system prompt** (means/σ/thresholds + failure-mode correlations) so the LLM reasons about which of the 6 readings are abnormal. No model file, no training.

---

## PHASE 3 — Orchestration architecture

### 3.1 Single service, one Groq client, many endpoints
```
ai-service/
├── main.py                 # FastAPI app, mounts routers, /health
├── config.py               # env: GROQ_API_KEY, GROQ_MODEL, GROQ_BASE_URL, limits
├── groq_client.py          # one AsyncOpenAI client pointed at Groq + chat() helper w/ JSON mode + retry
├── rate_limiter.py         # token-bucket (rpm/tpm) + priority queue
├── cache.py                # TTL cache (cachetools) keyed by payload hash
├── json_utils.py           # parse_json_or_raise(): JSON-mode → regex-extract → raise
├── prompts/
│   ├── classify.py         # SYSTEM, USER_TEMPLATE, FEWSHOT, SCHEMA
│   ├── predict.py
│   ├── match.py
│   ├── anomalies.py
│   ├── impact.py           # two-step: DEPS_* then IMPACT_*
│   ├── bids.py
│   ├── parts.py
│   └── knowledge.py
├── routers/                # classify.py, predict.py, match.py, anomalies.py, impact.py, bids.py, parts.py, knowledge.py
├── schemas/requests.py     # pydantic request/response models mirroring the TS interfaces
├── requirements.txt
├── Dockerfile
└── railway.toml
```

### 3.2 Prompt management
Store prompts as **Python modules** under `prompts/` (not loose .txt) so they're importable, type-checkable, and versionable in git. Each module exports `SYSTEM: str`, `USER_TEMPLATE: str` (`{{var}}` placeholders), `FEWSHOT: list[dict]` (role/content turns), and a `SCHEMA` doc string. Bump a `VERSION` constant per prompt when you change it (logged with each call for A/B comparison).

### 3.3 Structured output parsing (per endpoint)
- Call with `response_format={"type":"json_object"}` and a system instruction that **the entire reply must be a single JSON object** matching the schema.
- `json_utils.parse_json_or_raise(text)`: (1) `json.loads(text)`; (2) on failure, regex-extract the first balanced `{...}` and retry; (3) validate against the pydantic response model; (4) if still invalid → **raise** (router returns 502 → Express stub fires).
- Never return a half-parsed object to Express; a clean 5xx is what triggers the stub.

### 3.4 Rate limiting + priority queue (Groq free tier: 30 rpm, 1000/day, 8000 tpm, 200K/day)
`rate_limiter.py`:
- **Token bucket** on requests (30/min) and tokens (8000/min); estimate tokens before send, block/refuse if over.
- **asyncio.PriorityQueue** with 3 tiers:
  - **P0 (user-blocking / demo-critical):** classify, predict — never queued behind background work.
  - **P1:** match, impact, bids, parts (triggered by an ops action, user is waiting).
  - **P2 (background):** anomalies, knowledge — skippable; if the minute budget is exhausted, **return the stub immediately** instead of queueing.
- Daily guards (1000 req / 200K tok): once 90% consumed, **P2 features auto-serve stubs**; P0/P1 continue.
- Every call passes `max_tokens` (keep responses small: classify 200, predict 400, match 600, anomalies 500, impact 800, bids 700, parts 600, knowledge 500) to protect the tpm budget.

### 3.5 Prompt chaining — Cascading Impact (2-step)
```
Step A  /ai/impact-analyze  ── prompt impact.DEPS_* ──►  LLM maps the raw dependency rows into an ordered
         (input: machine_id, machine_dependencies[], buffers)   downstream chain (who is affected, in what order, when buffer runs out)
                                   │  pass: ordered_chain[]
                                   ▼
Step B  ── prompt impact.IMPACT_* ──►  LLM computes units lost/hr + ₹ at each node and orders-at-risk,
         (input: ordered_chain[], production_orders[], unit values)   returns the full tree with totals + a 0..100 score
```
Error handling: if Step A fails → fall back to a deterministic BFS over `machine_dependencies` (no LLM) and still run Step B; if Step B fails → return the Express stub (flat impact = this machine only). Each step is independently cached.

### 3.6 Caching
`cache.py` = `cachetools.TTLCache` keyed by `sha1(endpoint + canonical_json(payload))`:
| Endpoint | TTL | Rationale |
|---|---|---|
| predict | 10 min | sensor readings change slowly |
| anomalies | 10 min | same window → same answer |
| impact (each step) | 5 min | graph stable within an incident |
| parts-sourcing | 5 min | inventory moves slowly |
| knowledge-match | 60 min | corpus changes rarely |
| classify | 60 min (by normalized desc) | identical text → identical class |
| match / bids | **no cache** | candidate context varies every call |

### 3.7 Stub fallback mapping (preserved — no Express change)
| Groq endpoint fails/ratelimited → | Express stub that answers |
|---|---|
| `/ai/classify-request` | `classifyStub` (`classify.stub.ts`) |
| `/ai/predict-health` | `predictStub` (`predict.stub.ts`) |
| `/ai/match-technician` | `matchStub` (`match.stub.ts`) |
| `/ai/detect-anomalies` | inline empty (`ai.routes.ts:206`) |
| `/ai/impact-analyze` | deterministic BFS stub (add to Express `impact.routes.ts`) |
| `/ai/score-bids` | weighted-score stub (mirror matchStub math) |
| `/ai/parts-sourcing` | cheapest-local-first stub (pure SQL sort) |
| `/ai/knowledge-match` | SQL `ORDER BY success_flag, created_at` stub |
> New-feature stubs live on the **Express** side (same pattern as existing), so the platform works end-to-end even with Groq fully down.

---

## PHASE 4 — Implementation plan

### 4.1 Delete
- `ai-service/models/train_model.py` (no training in LLM arch). That's the only deletion — everything else is empty and gets filled, not removed.

### 4.2 Modify (minimal — Express side is already LLM-ready)
- `src/config/ai-service.ts` — no change (keeps `AI_SERVICE_URL`).
- `src/routes/ai.routes.ts` — no change for the 4 existing endpoints. **Add** routes for the 4 new LLM features only when those features land (`/api/ai/impact`, `/score-bids`, etc.) — or route new features through their own `impact.routes.ts`/`bids.routes.ts` (see integration report) which call `callAIService('/ai/impact-analyze', …)`.
- `src/ai-stubs/classify.stub.ts` — additive: emit `sub_category` so AI and stub shapes stay identical.

### 4.3 Create (all under `ai-service/`)
`main.py, config.py, groq_client.py, rate_limiter.py, cache.py, json_utils.py`, `prompts/*.py` (8), `routers/*.py` (8), `schemas/requests.py`, `requirements.txt`, `Dockerfile`, `railway.toml`. (Phase 5 gives the prompt bodies; `groq_client.py` + `json_utils.py` skeletons below.)

### 4.4 Dependencies
Remove: nothing (none present).
Add (`ai-service/requirements.txt`):
```
fastapi==0.115.*
uvicorn[standard]==0.30.*
openai>=1.40,<2            # OpenAI-compatible client, pointed at Groq base_url
pydantic==2.*
python-dotenv==1.*
cachetools==5.*
tenacity==9.*             # retry/backoff on transient Groq errors
```
(Using the `openai` SDK against Groq's base URL is the most portable "OpenAI-compatible" choice; the official `groq` SDK is a drop-in alternative.)

### 4.5 Environment variables
`.env` (root, used by Express) — unchanged except point at the live service when deployed:
```
AI_SERVICE_URL=http://localhost:8000          # → https://<your-ai>.up.railway.app in prod
```
`ai-service/.env` (new):
```
GROQ_API_KEY=gsk_...
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=openai/gpt-oss-20b
GROQ_RPM=30
GROQ_TPM=8000
GROQ_DAILY_REQUESTS=1000
GROQ_DAILY_TOKENS=200000
PORT=8000
```

### 4.6 Build order (hrs)
| # | Step | hrs |
|---|---|---|
| 1 | `config.py` + `groq_client.py` (one AsyncOpenAI client, `chat_json()` helper, tenacity retry) + `json_utils.py` + `main.py` + `/health` | 2 |
| 2 | `rate_limiter.py` (token bucket + priority queue) + `cache.py` | 2 |
| 3 | `prompts/classify.py` + `routers/classify.py` + schema → test vs stub shape | 1.5 |
| 4 | `prompts/predict.py` (+AI4I baselines) + router | 2 |
| 5 | `prompts/match.py` + router | 1.5 |
| 6 | `prompts/anomalies.py` + router | 1.5 |
| 7 | New features: impact (2-step chain), bids, parts, knowledge prompts + routers | 5 |
| 8 | `requirements.txt`, `Dockerfile`, `railway.toml`; deploy; set Express `AI_SERVICE_URL` | 1.5 |
| 9 | Schema-contract tests (Phase 4.7) for all 8 endpoints | 2 |
| | **Total** | **~19 h** |

### 4.7 Testing plan
- **Contract test per endpoint:** POST a known payload → assert the JSON validates against the pydantic response model AND has the exact keys the TS stub returns. Run with and without `GROQ_API_KEY` (missing key must 5xx fast so Express stubs).
- **Golden inputs:** reuse seed machines — M-104 (expect HIGH/CRITICAL predict), M-200 (expect LOW). classify "hydraulic leak…" → HYDRAULIC/HIGH.
- **Malformed-JSON drill:** monkeypatch the client to return prose → `parse_json_or_raise` must raise → router 502.
- **Rate-limit drill:** fire 40 calls/min → P2 endpoints must serve-stub (502) while P0 still answer.
- **Express integration:** `npm run demo` with the service up → every step logs `source: 'ai'`; stop the service → same demo logs `source: 'stub'` and still completes.

---

## PHASE 5 — Complete prompt library (copy-paste ready)

**Conventions for every endpoint:** model `openai/gpt-oss-20b`, `temperature` as noted, `response_format={"type":"json_object"}`, `max_tokens` per §3.4. The system prompt always ends with: *"Respond with ONE JSON object only. No markdown, no prose, no code fences."* Few-shot turns alternate user→assistant.

### Shared client skeleton (`ai-service/groq_client.py`)
```python
import os, json
from openai import AsyncOpenAI
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from openai import APITimeoutError, RateLimitError, APIError

client = AsyncOpenAI(api_key=os.environ["GROQ_API_KEY"],
                     base_url=os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1"))
MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")

@retry(stop=stop_after_attempt(2),
       wait=wait_exponential(multiplier=0.5, max=4),
       retry=retry_if_exception_type((APITimeoutError, RateLimitError, APIError)))
async def chat_json(system: str, messages: list[dict], max_tokens: int, temperature: float = 0.2) -> str:
    resp = await client.chat.completions.create(
        model=MODEL, temperature=temperature, max_tokens=max_tokens,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": system}, *messages],
    )
    return resp.choices[0].message.content
```
`ai-service/json_utils.py`
```python
import json, re
def parse_json_or_raise(text: str, model):           # model = pydantic class
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)     # recover first {...}
        if not m: raise ValueError("no JSON object in LLM output")
        obj = json.loads(m.group(0))
    return model.model_validate(obj)                  # raises on schema mismatch
```

---

### 5.1 Classification — `/ai/classify-request`  (temp 0.1, max_tokens 200)
**SYSTEM**
```
You are an industrial equipment maintenance intake expert at a multi-site factory.
Classify a free-text service request into a fixed taxonomy and assess urgency.

category MUST be exactly one of:
MECHANICAL, ELECTRICAL, HYDRAULIC, PNEUMATIC, SOFTWARE, CALIBRATION, SAFETY, PREVENTIVE, OTHER
priority MUST be exactly one of: CRITICAL, HIGH, MEDIUM, LOW
sub_category is a SHORT UPPER_SNAKE_CASE failure tag (e.g. SEAL_LEAK, BEARING_THERMAL, WIRING_FAULT, TOOL_WEAR, OVERHEAT, CALIBRATION_DRIFT). Use OTHER if unclear.

Priority rules: anything risking injury/fire/safety = CRITICAL. Production-stopping or rapidly worsening = HIGH. Degraded but running = MEDIUM. Routine/preventive = LOW.
confidence is 0.0-1.0 (your certainty in the category).
reasoning is one short sentence citing the key phrase that drove the decision.

Respond with ONE JSON object only. No markdown, no prose, no code fences.
```
**USER_TEMPLATE**
```
Service request description:
"""{{description}}"""
```
**FEWSHOT**
```
U: Service request description:
"""The hydraulic system on CNC Mill M-104 is leaking fluid near the main cylinder and pressure is dropping with grinding noises."""
A: {"category":"HYDRAULIC","sub_category":"SEAL_LEAK","priority":"HIGH","confidence":0.88,"reasoning":"'leaking fluid' and 'pressure dropping' indicate a hydraulic seal failure degrading operation."}

U: Service request description:
"""Smoke coming from the control panel of the welding robot, smells like burning plastic."""
A: {"category":"SAFETY","sub_category":"ELECTRICAL_FIRE","priority":"CRITICAL","confidence":0.95,"reasoning":"'smoke' and 'burning' from an electrical panel is an immediate safety/fire hazard."}
```
**SCHEMA (TS)** `{ category: string; sub_category: string; priority: "CRITICAL"|"HIGH"|"MEDIUM"|"LOW"; confidence: number; reasoning: string }`

---

### 5.2 Predictive maintenance — `/ai/predict-health`  (temp 0.1, max_tokens 400)
**SYSTEM** (AI4I 2020 baselines baked in as reasoning context — no model file)
```
You are an industrial equipment diagnostics expert. You predict failure risk from 6 sensor readings by reasoning about which readings deviate from normal operating ranges, using the AI4I-2020 statistical baselines below. You do NOT run a model; you reason explicitly.

NORMAL OPERATING BASELINES (AI4I 2020):
- air_temp (°C): mean 300K≈26.9, typical 24-30. Elevated >32.
- process_temp (°C): mean ≈36.9, typical 34-41. process_temp - air_temp normally 8-12; >12 suggests heat-dissipation trouble.
- rotational_speed (rpm): typical 1300-2100. <1200 or >2400 is abnormal (power/strain).
- torque (Nm): typical 30-50. >60 high strain; very low (<15) with high speed = tool slip.
- tool_wear (min): 0-200 normal; 200-240 caution; >240 high wear.

FAILURE MODES (AI4I) and their correlates:
- Tool Wear Failure (TWF): tool_wear > ~200.
- Heat Dissipation Failure (HDF): (process_temp-air_temp) > ~12 AND rotational_speed low.
- Power Failure (PWF): torque*speed outside ~3500-9000 (W proxy) — very high or very low power.
- Overstrain Failure (OSF): tool_wear * torque high (worn tool under load).
- Random Failure (RNF): rare, low baseline.

Output:
- failure_probability: 0.0-1.0 overall risk.
- risk_level: LOW (<0.15), MEDIUM (0.15-0.4), HIGH (0.4-0.7), CRITICAL (>=0.7).
- failure_modes: array of {mode, probability} for the plausible modes (probability 0-1). If none, one entry {"mode":"No significant risk detected","probability":0.05}.
- recommended_action: one actionable sentence.

Respond with ONE JSON object only. No markdown, no prose, no code fences.
```
**USER_TEMPLATE**
```
Sensor readings:
air_temp={{air_temp}} °C, process_temp={{process_temp}} °C, rotational_speed={{rotational_speed}} rpm, torque={{torque}} Nm, tool_wear={{tool_wear}} min.
Machine: {{machine_code}} ({{machine_type}}).
```
**FEWSHOT**
```
U: Sensor readings: air_temp=25.5, process_temp=38.2, rotational_speed=1480, torque=55.3, tool_wear=210. Machine: M-104 (CNC Mill).
A: {"failure_probability":0.58,"risk_level":"HIGH","failure_modes":[{"mode":"Tool Wear Failure","probability":0.55},{"mode":"Heat Dissipation Failure","probability":0.3},{"mode":"Overstrain Failure","probability":0.25}],"recommended_action":"Schedule immediate inspection: replace the worn tool and check cooling before the next production run."}

U: Sensor readings: air_temp=23.0, process_temp=30.1, rotational_speed=1500, torque=35.0, tool_wear=50. Machine: M-200 (Press).
A: {"failure_probability":0.08,"risk_level":"LOW","failure_modes":[{"mode":"No significant risk detected","probability":0.05}],"recommended_action":"Continue normal operation; next scheduled maintenance is adequate."}
```
**SCHEMA (TS)** `{ failure_probability: number; risk_level: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL"; failure_modes: {mode:string; probability:number}[]; recommended_action: string }`

---

### 5.3 Technician matching — `/ai/match-technician`  (temp 0.2, max_tokens 600)
**SYSTEM**
```
You are a workforce-optimization expert dispatching technicians for industrial repairs.
Rank the AVAILABLE technicians for this service request. Score each 0-100.

Weigh (highest first):
1) Skill/specialization match to the request category (most important).
2) Current workload: prefer lower current_job_count / max_concurrent_jobs.
3) Same-site as the request (reduces travel).
4) Track record: higher rating and lower avg_resolution_hours.
5) Relevant certifications.
Also use nuanced cues in the data (e.g. a tech who recently handled this machine/category).
Exclude technicians who are not available. Return at most 5, sorted by score descending.
reasoning: one short phrase per technician citing the main factors.

Respond with ONE JSON object only. No markdown, no prose, no code fences.
```
**USER_TEMPLATE**
```
Service request: category={{category}}, priority={{priority}}, site_id={{site_id}}, machine={{machine_code}}, description="{{description}}".
Available technicians (JSON array):
{{technicians_json}}
```
**FEWSHOT**
```
U: Service request: category=HYDRAULIC, priority=HIGH, site_id=siteA, machine=M-104, description="hydraulic seal leak".
Available technicians (JSON array):
[{"id":"t1","specializations":["hydraulic","mechanical","cnc"],"current_job_count":1,"max_concurrent_jobs":3,"site_id":"siteA","rating":4.8,"avg_resolution_hours":3.2},
 {"id":"t2","specializations":["electrical","plc"],"current_job_count":2,"max_concurrent_jobs":3,"site_id":"siteA","rating":4.5,"avg_resolution_hours":4.1}]
A: {"ranked_technicians":[{"technician_id":"t1","score":94,"reasoning":"Hydraulic+CNC specialist, same site, light load, fast resolver."},{"technician_id":"t2","score":48,"reasoning":"Same site but no hydraulic skill and busier."}]}
```
**SCHEMA (TS)** `{ ranked_technicians: { technician_id:string; score:number; reasoning:string }[] }`

---

### 5.4 Anomaly detection — `/ai/detect-anomalies`  (temp 0.3, max_tokens 500)
**SYSTEM**
```
You are an operations analyst monitoring factory maintenance activity. Given aggregated service-request data for a time window and historical baselines, identify genuine anomalies (frequency spikes, unusual category/site/technician concentrations, abnormal distributions). Do NOT invent anomalies; if nothing stands out, return an empty array with a clear summary.

For each anomaly: type (e.g. CATEGORY_SPIKE, SITE_CONCENTRATION, TECH_OVERLOAD, SLA_CLUSTER), description (what and how far from baseline), severity (CRITICAL|HIGH|MEDIUM|LOW), affected (the site/category/technician), evidence (the numbers).

Respond with ONE JSON object only. No markdown, no prose, no code fences.
```
**USER_TEMPLATE**
```
Window: {{window_label}}. Baselines: {{baselines_json}}.
Aggregates (counts by category/site/day/technician):
{{aggregates_json}}
```
**FEWSHOT**
```
U: Window: last 24h. Baselines: {"HYDRAULIC_per_day_siteA":2}. Aggregates: {"by_category_site":{"HYDRAULIC@siteA":9},"by_day":{"today":14,"avg":5}}.
A: {"anomalies":[{"type":"CATEGORY_SPIKE","description":"Hydraulic requests at Site A are 9 today vs baseline ~2 (4.5x).","severity":"HIGH","affected":"HYDRAULIC@siteA","evidence":{"observed":9,"baseline":2}}],"summary":"One significant spike: hydraulic failures clustering at Site A — possible common root cause."}

U: Window: last 24h. Baselines: {"total_per_day":5}. Aggregates: {"by_day":{"today":5,"avg":5}}.
A: {"anomalies":[],"summary":"No anomalies: volume and distribution are within normal range."}
```
**SCHEMA (TS)** `{ anomalies: { type:string; description:string; severity:"CRITICAL"|"HIGH"|"MEDIUM"|"LOW"; affected:string; evidence:any }[]; summary:string }`

---

### 5.5 Cascading impact — `/ai/impact-analyze`  (2-step chain, temp 0.1)

**Step A — dependency ordering** (prompts/impact.DEPS_SYSTEM, max_tokens 400)
```
SYSTEM: You are a production-systems analyst. Given a failed machine and a list of directed dependency edges (upstream FEEDS downstream, with throughput and buffer_hours), produce the ordered list of downstream machines that lose production if the failed machine stays down, with the hour at which each is affected (accounting for buffer_hours). Detect and ignore cycles. Respond with ONE JSON object only.
USER: failed_machine={{machine_code}} (id {{machine_id}}). Edges (JSON): {{edges_json}}.
→ {"ordered_chain":[{"machine_id","machine_code","depth","affected_after_hours","throughput_rate","unit_value"}]}
```
**Step B — monetary impact** (prompts/impact.IMPACT_SYSTEM, max_tokens 800)
```
SYSTEM: You are a production-systems analyst. Given an ordered downstream chain and active production orders with deadlines/penalties, compute per node: units_lost_per_hour (= throughput_rate once its buffer is exhausted), inr_per_hour (= units_lost_per_hour * unit_value), and orders_at_risk (orders whose deadline cannot be met if this node is down). Produce a nested tree and overall totals, plus a cascading_impact_score 0-100 (higher = more downstream machines, more ₹/hr, more penalties at risk). All money in INR (₹). Respond with ONE JSON object only.
USER: ordered_chain={{ordered_chain_json}}. production_orders={{orders_json}}. hours_down={{hours}}.
```
**SCHEMA (TS)** (final):
```ts
interface ImpactNode { machine_id:string; machine_code:string; depth:number;
  units_lost_per_hour:number; inr_per_hour:number;
  orders_at_risk:{order_code:string; deadline:string; penalty_inr:number}[]; children:ImpactNode[] }
interface ImpactRes { root_machine_id:string; downstream_count:number;
  total_units_lost_per_hour:number; total_inr_per_hour:number;
  total_penalty_at_risk_inr:number; cascading_impact_score:number; tree:ImpactNode }
```
**Few-shot (Step B, abbreviated):** input chain M-104→M-200→M-300 (throughputs 40,35; unit_values ₹1200,₹1800) with order PO-5001 (qty 500, deadline +36h, penalty ₹50000) → tree with `total_inr_per_hour` = 40×1200 + 35×1800 = ₹111,000/hr, PO-5001 flagged at risk, `cascading_impact_score` ~85.

---

### 5.6 Bid scoring — `/ai/score-bids`  (temp 0.2, max_tokens 700)
**SYSTEM**
```
You are a procurement and repair-evaluation expert. Score blind technician bids for one service request and rank them. Score each 0-100 on a weighted blend:
- completeness of diagnosis + solution steps (25%)
- cost-efficiency vs the median bid (20%)
- technician historical success_rate on similar jobs (20%)
- estimated time to fix, shorter better for the priority (15%)
- parts availability score (can the proposed parts actually be sourced fast) (10%)
- match to a historically successful known solution, if provided (10%)
Give concise justification per bid and name the recommended winner. Do not reveal bids to each other; just evaluate. Respond with ONE JSON object only.
```
**USER_TEMPLATE**
```
Request: category={{category}}, priority={{priority}}, machine={{machine_code}}.
Known successful solution (optional): {{knowledge_json}}.
Bids (JSON array; each has bid_id, technician success_rate, diagnosis, solution_steps, parts_list, estimated_hours, estimated_cost, parts_availability_score):
{{bids_json}}
```
**SCHEMA (TS)**
```ts
interface ScoredBid { bid_id:string; score:number; justification:string; recommended:boolean }
interface ScoreBidsRes { ranked_bids: ScoredBid[]; winner_bid_id: string; }
```
**Few-shot:** two bids (one cheaper+faster+high success, one thorough but costly) → the balanced one wins with reasoning citing cost-efficiency and success_rate.

---

### 5.7 Parts sourcing — `/ai/parts-sourcing`  (temp 0.1, max_tokens 600)
**SYSTEM**
```
You are a supply-chain analyst. For each required part, choose the optimal source across: local site inventory (free, instant), other company sites (transfer time), and external vendors (lead time + cost). Recommend cheapest acceptable source that meets the urgency; if a part is unavailable everywhere, propose compatible substitutes (from the compatibility list) or a temporary-fix flag. Return a sourcing matrix with a clear per-part recommendation and a total cost + ready-by time. All money in INR (₹). Respond with ONE JSON object only.
```
**USER_TEMPLATE**
```
Urgency: priority={{priority}}, sla_hours_remaining={{sla_remaining}}.
Required parts: {{required_json}}            // [{part_number, quantity}]
Local inventory: {{local_json}}              // [{part_number, available}]
Other sites: {{sites_json}}                  // [{part_number, site_name, available, transfer_hours}]
Vendor catalog: {{vendors_json}}             // [{part_number, vendor_name, price, lead_time_hours, min_order_qty}]
Compatibility: {{compat_json}}               // [{part_number, compatible_part_number, notes}]
```
**SCHEMA (TS)**
```ts
interface PartRec { part_number:string; required_qty:number;
  recommended:{source_type:"LOCAL"|"CROSS_SITE"|"VENDOR"|"SUBSTITUTE"; detail:string; unit_cost:number; ready_in_hours:number};
  unavailable:boolean; substitutes:{part_number:string; notes:string}[] }
interface SourcingRes { matrix: PartRec[]; total_cost_inr:number; ready_by_hours:number; notes:string }
```

---

### 5.8 Knowledge matching — `/ai/knowledge-match`  (temp 0.2, max_tokens 500)
**SYSTEM**
```
You are a knowledge-management expert for industrial maintenance. Given a new problem (description + category + machine_type) and a list of past resolved cases, return the TOP 3 most relevant past solutions, ranked by similarity AND historical success. Prefer cases with success_flag=true and matching sub_category/machine_type. For each, give a one-line match_reason. If fewer than 3 relevant cases exist, return what matches (possibly empty). Respond with ONE JSON object only.
```
**USER_TEMPLATE**
```
New problem: category={{category}}, machine_type={{machine_type}}, sub_category={{sub_category}}, description="{{description}}".
Past cases (JSON array; each has entry_id, category, machine_type, sub_category, solution_summary, resolution_hours, cost, success_flag):
{{cases_json}}
```
**SCHEMA (TS)**
```ts
interface KnowledgeHit { entry_id:string; solution_summary:string; resolution_hours:number;
  cost:number; success:boolean; relevance:number; match_reason:string }
interface KnowledgeRes { matches: KnowledgeHit[]; }
```
**Few-shot:** new HYDRAULIC/SEAL_LEAK on CNC Mill → returns prior SEAL_LEAK case (success) first with reason "same sub_category + machine_type, fix held 30+ days", a generic hydraulic case second.

---

## Quick-start checklist
- [ ] `ai-service/.env` with `GROQ_API_KEY`, `GROQ_MODEL=openai/gpt-oss-20b`, `GROQ_BASE_URL`
- [ ] Build step 1–2 (client, limiter, cache, health) → `GET /health` 200
- [ ] Fill `prompts/*.py` from Phase 5; wire routers; contract-test each vs the TS stub shape
- [ ] Deploy ai-service (Railway) → set Express `AI_SERVICE_URL` to the deployed URL
- [ ] `npm run demo` → expect `source:'ai'`; kill the service → `source:'stub'`, demo still passes
- [ ] Load-drill the rate limiter: P0 (classify/predict) always answer; P2 (anomalies/knowledge) serve stubs under pressure
```
