<div align="center">

# Ajay Krishna M.

**AI Engineer · LLM systems · Applied AI**

I build agent tools, retrieval systems, and model adaptations that can be evaluated, secured, and operated.

<a href="https://ajaybe-ops.github.io/"><img src="https://img.shields.io/badge/Portfolio-ajaybe--ops.github.io-0969da?style=flat-square&logo=githubpages&logoColor=white" alt="Portfolio"></a>
<a href="https://www.linkedin.com/in/ajaykrishagi/"><img src="https://img.shields.io/badge/LinkedIn-Ajay%20Krishna%20M.-0A66C2?style=flat-square&logo=linkedin&logoColor=white" alt="LinkedIn"></a>
<a href="mailto:ajaykrishiit.uk@gmail.com"><img src="https://img.shields.io/badge/Email-ajaykrishiit.uk%40gmail.com-EA4335?style=flat-square&logo=gmail&logoColor=white" alt="Email"></a>
<a href="https://x.com/jaykrishAGI"><img src="https://img.shields.io/badge/X-%40jaykrishAGI-000000?style=flat-square&logo=x&logoColor=white" alt="X"></a>

<img src="https://komarev.com/ghpvc/?username=ajaybe-ops&label=Profile%20views&color=0969da&style=flat-square" alt="Profile views">

</div>

## Languages and tools

<div align="center">

<img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
<img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
<img src="https://img.shields.io/badge/PyTorch-EE4C2C?style=for-the-badge&logo=pytorch&logoColor=white" alt="PyTorch">
<img src="https://img.shields.io/badge/TensorFlow-FF6F00?style=for-the-badge&logo=tensorflow&logoColor=white" alt="TensorFlow">
<img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
<img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
<img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL">
<img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React">
<img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js">
<img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS">
<img src="https://img.shields.io/badge/NumPy-013243?style=for-the-badge&logo=numpy&logoColor=white" alt="NumPy">
<img src="https://img.shields.io/badge/pandas-150458?style=for-the-badge&logo=pandas&logoColor=white" alt="pandas">
<img src="https://img.shields.io/badge/scikit--learn-F7931E?style=for-the-badge&logo=scikitlearn&logoColor=white" alt="scikit-learn">
<img src="https://img.shields.io/badge/GitHub_Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white" alt="GitHub Actions">
<img src="https://img.shields.io/badge/Model_Context_Protocol-6E40C9?style=for-the-badge" alt="Model Context Protocol">

</div>

<sub>Only tools that appear in the public or evaluated work below — no badge wall of things I have not shipped.</sub>

## GitHub analytics

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/github-stats-dark.svg">
  <img src="assets/github-stats.svg" alt="GitHub statistics card: 25 public repositories, 13 stars, 2 followers, and 223 contributions in the last year." width="410">
</picture>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/top-languages-dark.svg">
  <img src="assets/top-languages.svg" alt="Top languages card, by bytes: Jupyter Notebook 82.7%, Python 9.0%, HTML 5.0%, TypeScript 3.2%." width="410">
</picture>

</div>

<sub>Generated from the GitHub API on 2026-11-04 by [`scripts/profile_stats.py`](scripts/profile_stats.py). Activity volume measures usage, not engineering quality — the evidence starts below.</sub>

---

I'm an AI engineering student at **IIT G** and the builder behind [Aegis MCP](https://github.com/ajaybe-ops/aegis-mcp), a production-oriented Model Context Protocol server for vulnerability intelligence and incident triage.

My work sits where **LLM tooling, retrieval, and reliability engineering** meet: typed tool surfaces for agents, deterministic risk scoring, evidence-contract evaluations for RAG, and parameter-efficient fine-tuning. I care less about demos that look good once and more about systems that can be re-run, audited, and operated.

**Open to:** AI Engineer, LLM Engineer, and Applied AI roles.

`Python` · `TypeScript` · `MCP` · `RAG` · `PyTorch` · `FastAPI` · `Docker`

[Selected work](#selected-work) · [Achievements](#achievements--milestones) · [Skills](#technical-skills) · [Contact](#contact)

---

## Selected work

### 01 — Aegis MCP

**Agent tooling for vulnerability intelligence and incident triage**  
[Repository](https://github.com/ajaybe-ops/aegis-mcp) · [Architecture](https://github.com/ajaybe-ops/aegis-mcp/blob/main/docs/ARCHITECTURE.md) · Python · MCP · FastAPI · SQLite · OpenTelemetry

A Model Context Protocol server that gives agents a typed, policy-scored surface for CVE lookup, package scanning, and multi-step incident triage across NVD, FIRST EPSS, CISA KEV, and OSV.

- **Tool surface:** 6 MCP tools, 4 resources, and 3 prompts over stdio and streamable HTTP.
- **Agent safety:** JWT/JWKS validation, per-tool scope enforcement, token-bucket rate limits, sanitized untrusted feed text, and fail-closed configuration.
- **Reliability:** TTL/LRU cache with single-flight, retries with jitter, circuit breakers, deadlines, idempotent triage fingerprints, and explicit partial-result coverage.
- **Verified:** **171 tests passing at 91.74% coverage**; **12/12** offline eval scenarios; ruff and strict mypy clean; CI and security workflows green on `main`, including a Docker health/401 smoke test.

### 02 — Enterprise RAG

**Auditable hybrid retrieval with evidence-contract evaluations**  
[Repository](https://github.com/ajaybe-ops/enterprise-rag) · [Architecture](https://github.com/ajaybe-ops/enterprise-rag/blob/main/ARCHITECTURE.md) · Python · FastAPI · BM25 · NumPy LSA

A retrieval system built on one premise: a metric you cannot attribute is a metric you cannot improve. The corpus is a content-addressed, versioned artifact; every run is tied to a manifest, and metric movement is attributed to the corpus, chunking, ranking, or noise.

- **Retrieval:** BM25 plus a dense LSA leg, status-aware ranking, tenant-aware authorization, citation verification, and abstention.
- **Evaluation:** an 87-document seeded corpus and 90 probes across 7 categories: direct, paraphrase, multi-hop, lexical trap, forbidden source, version conflict, and unanswerable.
- **Verified:** **149 tests passing**; recall@5 **0.950**, nDCG@5 **0.920**, MRR **0.811**, fact coverage **1.000**, **0** authorization or version-preference violations at p95 **56 ms**.
- **Honest edge:** multi-hop retrieval is the weakest slice. The repository reports it rather than tuning it away.

### 03 — TensorTonic: 105 ML/DL primitives from scratch

**The mechanics behind modern AI systems, not just library calls**  
[Repository](https://github.com/ajaybe-ops/TensorTonic-Solutions) · Python · NumPy

A verified set of **105 implementations** covering the internals that show up in real LLM and ML debugging: BM25, causal attention masking, GRU cells, batch normalization, GELU, dropout, convolution and pooling, calibration (ECE, isotonic), drift detection, and classical ML.

- One self-contained module per problem; most include a written explanation of the contract and edge cases.
- Built for the failure modes that matter in LLM work: shape bugs, masking bugs, numerical stability, and evaluation errors.
- **Verified:** 105 problem directories and 105 Python implementations in the repository; solutions are synced from TensorTonic, where they are platform-checked.

### 04 — Llama 3.2 3B instruction tuning

**A complete parameter-efficient SFT path**  
[Repository](https://github.com/ajaybe-ops/Finetuning-Llama3.2-3B-) · Python · Unsloth · PEFT/LoRA · TRL

A supervised fine-tuning run on `mlabonne/FineTome-100k`, built to understand the full adaptation path: 4-bit loading, LoRA target selection, chat-template formatting, training, and post-training inference.

- **Setup:** Llama-3.2-3B-Instruct, 4-bit, LoRA rank 16 across attention and MLP projections, max sequence length 2,848.
- **Training:** 100,000-example dataset, 60 optimization steps, effective batch size 16, learning rate 2e-4.
- **Verified from notebook outputs:** **24,313,856 trainable parameters (0.75%)**, training loss **1.017**, **13.0 minutes** on a single Tesla T4.

### Also built

| Project | What it is | Stack |
| --- | --- | --- |
| [Healthcare Diagnostic Platform](https://github.com/ajaybe-ops/healthcare-diagnostic-platform) | Pneumonia CNN model artifact plus an arrhythmia training, evaluation, and explainability pipeline. Not clinically validated. | Python, TensorFlow/Keras, scikit-learn, Streamlit |
| [WhatsApp Audit Export](https://github.com/ajaybe-ops/WhatsApp-Audit-Export) | Deterministic WhatsApp export parser with confidence scoring, a full audit trail, and auditor-ready Excel export. | TypeScript, React, Express, PostgreSQL, ExcelJS |
| [Resonance](https://github.com/ajaybe-ops/Resonance-) | Spotify-connected sing-along app with synchronized lyrics and focus controls. | Next.js, TypeScript, Spotify Web Playback SDK |

---

## Achievements & milestones

| Milestone | Evidence |
| --- | --- |
| **171 tests · 91.74% coverage · 12/12 evals** | Aegis MCP, re-run 2026-11-04 with `pytest --cov` and `aegis-mcp eval` |
| **149 tests · 90 evidence probes · 0 authorization violations** | Enterprise RAG, re-run 2026-11-04 with `uv run pytest -q` and `scripts/evaluate.py` |
| **105 ML/DL primitives implemented from scratch** | TensorTonic Solutions repository |
| **Llama 3.2 3B LoRA: 24.3M trainable parameters (0.75%), loss 1.017, 13 min on a T4** | Fine-tuning notebook with committed training outputs |
| **5 CI jobs across 2 workflows, green on `main`** | Aegis MCP: lint, format, strict mypy, tests, evals, Bandit, pip-audit, Docker health/401 smoke test |

These are engineering checkpoints, not claims about production scale. Each one is reproducible from the linked repository; none are estimated or rounded up.

---

## Technical skills

| Area | Tools used in public or evaluated work |
| --- | --- |
| **LLM & agents** | MCP, tool/function calling, prompt design, RAG, BM25, embeddings/LSA, LoRA/QLoRA, SFT, Hugging Face Transformers, TRL, Unsloth, PEFT |
| **Evaluation** | Evidence-contract design, recall@k, nDCG, MRR, deterministic offline suites, regression gates, coverage |
| **ML & data** | PyTorch, TensorFlow/Keras, scikit-learn, NumPy, pandas, Matplotlib, calibration, drift detection, SQL |
| **Backend** | Python, FastAPI, Pydantic, TypeScript, Node.js, Express, SQLite, PostgreSQL, Drizzle |
| **Frontend** | React, Next.js, Tailwind CSS, shadcn/ui, Vite |
| **Infrastructure & quality** | Docker, GitHub Actions, pytest, ruff, mypy, Bandit, pip-audit, OpenTelemetry, JWT/JWKS, structured logging |

---

## How I work

- **Evaluation before polish.** If a system cannot be re-run and attributed, I do not trust the number.
- **Fail closed, degrade explicitly.** Security checks deny by default; upstream failures return typed partial results with coverage, not silent guesses.
- **Write the limitation down.** The READMEs state what is synthetic, offline, single-node, or unvalidated.

---

## Contact

I'm looking for **AI Engineer / LLM Engineer / Applied AI** roles where evaluation rigor and production reliability matter.

[Email](mailto:ajaykrishiit.uk@gmail.com) · [LinkedIn](https://www.linkedin.com/in/ajaykrishagi/) · [Portfolio](https://ajaybe-ops.github.io/) · [GitHub](https://github.com/ajaybe-ops)

<sub>Every metric on this page was re-verified on 2026-11-04 from the linked repository. No estimated or fabricated results. Certifications are listed only when completed and verifiable.</sub>
