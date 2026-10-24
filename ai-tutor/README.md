# 🎓 AI Tutor

A **Responsible AI** web platform that lets an LLM-powered tutor discuss lecture content with students — grounded exclusively in professor-provided course PDFs. Built with IBM's API gateway (ICA), it enforces citation-based answers, supports Socratic scaffolding, and surfaces aggregate learning insights for professors.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Responsible AI Design](#responsible-ai-design)
- [Development Notes](#development-notes)

---

## Overview

AI Tutor is a dual-role application:

- **Professors** create courses, upload lecture PDFs, write a custom tutor persona prompt, and toggle _Socratic mode_ on or off.
- **Students** chat with the AI tutor in a clean interface. Every answer is sourced exclusively from the uploaded course PDFs — the tutor will never hallucinate or draw on outside knowledge. Citations link back to the original document.
- **Insights dashboard** gives professors a bird's-eye view of what topics students are asking about most, and flags any topic clusters where the tutor consistently couldn't find an answer (potential content gaps).

---

## Features

### Professor View
| Feature | Description |
|---|---|
| Course management | Create, rename, and delete courses. Each course gets its own isolated document collection. |
| PDF upload | Drag-and-drop upload. PDFs are sent to ICA for extraction and chunking, then attached to the course's document collection. |
| Custom tutor prompt | Free-text field to give the tutor additional behavioral instructions (e.g. "only answer questions about supervised learning"). |
| Socratic mode toggle | Switch between guided-hint mode (Socratic) and direct-answer mode per course. |
| API key health check | On load, the settings view pings `/health` and displays a banner if the IBM API key is missing or invalid. |

### Student View
| Feature | Description |
|---|---|
| Grounded chat | All answers are generated from course documents only. If a topic isn't covered, the tutor says so explicitly — no guessing. |
| Source citations | Each tutor reply lists the source document and content snippet (relevance-filtered, top 5 by score). Clicking a citation opens the PDF at the relevant passage. |
| Socratic mode | When enabled, the tutor gives a guiding hint or asks a clarifying question first; full explanations require a follow-up. |
| Thumbs feedback | Students can upvote or downvote any tutor reply (stored for aggregate analysis). |
| Transparency banner | A persistent notice reminds students that responses are AI-generated and may contain errors. |
| Chat persistence | Chat history per course is stored in `localStorage` so it survives page refreshes. |
| Course materials tab | Students can browse and open all uploaded PDFs for the selected course. |

### Insights Dashboard
| Feature | Description |
|---|---|
| Question clustering | All student questions are embedded locally (sentence-transformers) and grouped into up to 5 topic clusters using k-means. |
| LLM labelling | The LLM writes a short (≤ 6 word) label for each cluster based on its example questions. |
| Gap detection | Clusters where > 50 % of answers were "not covered in course material" are flagged as content gaps. |
| Auto-refresh | Clusters are recomputed when stale (> 5 minutes old) and there are at least 3 questions logged. |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│  React 18 + Vite + Tailwind CSS                         │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐ │
│  │ StudentChat  │  │ProfessorSettings│ │InsightsDash  │ │
│  └──────┬───────┘  └───────┬────────┘ └──────┬───────┘ │
└─────────┼──────────────────┼─────────────────┼─────────┘
          │  HTTP (proxied via Vite → :8000)    │
┌─────────▼──────────────────▼─────────────────▼─────────┐
│                    FastAPI Backend (:8000)               │
│  ┌──────┐  ┌────────┐  ┌─────────┐  ┌───────────────┐  │
│  │ RAG  │  │ Ingest │  │Cluster  │  │ SQLite via    │  │
│  │(rag) │  │(ingest)│  │(cluster)│  │ SQLAlchemy    │  │
│  └──┬───┘  └───┬────┘  └────┬────┘  └───────────────┘  │
└─────┼──────────┼────────────┼───────────────────────────┘
      │          │            │  (local embeddings)
      │          │        sentence-transformers
      │          │
      ▼          ▼
┌─────────────────────────────┐
│   IBM ICA API Gateway       │
│   /v1/files                 │  ← PDF upload & extraction
│   /v1/document-collections  │  ← Per-course collections
│   /v1/chat-models           │  ← LLM chat (grounded RAG)
└─────────────────────────────┘
```

**Data flow for a student question:**

1. Frontend sends `POST /chat` with `course_id`, `session_id`, and `question`.
2. Backend builds a system prompt (with Socratic instruction + custom tutor prompt).
3. ICA's chat endpoint is called with the course's `document_collection_id` as a `files` reference — ICA retrieves relevant chunks natively and returns sources alongside the answer.
4. High-relevance sources (score > 0.85) are extracted, deduplicated, and returned to the frontend.
5. The interaction (question, answer, sources, session) is logged to SQLite for later insight analysis.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Backend framework | Python + FastAPI | 3.11 / 0.111 |
| Database | SQLite + SQLAlchemy | 2.0 |
| PDF parsing (page count) | PyMuPDF | 1.24 |
| LLM + document RAG | IBM ICA (OpenAI-compatible proxy) | — |
| Local embeddings (clustering) | sentence-transformers (`all-MiniLM-L6-v2`) | ≥ 3.0 |
| Clustering | scikit-learn KMeans | 1.5 |
| HTTP client (ICA calls) | httpx | ≥ 0.27 |
| Frontend framework | React 18 + Vite | 18.3 / 6.x |
| Styling | Tailwind CSS | v4 |
| Charts | Recharts | 2.x |
| Language | TypeScript | 5.5 |

---

## Prerequisites

- **Python 3.11+**
- **Node.js 18+** and npm
- An **IBM ICA API key** (`IBM_API_KEY`) with access to:
  - `/v1/files` — file upload
  - `/v1/document-collections` — collection management
  - `/v1/chat-models` — LLM inference

---

## Quick Start

### 1. Clone & configure secrets

```bash
git clone <repo-url>
cd ai-tutor
cp .env.example .env
```

Edit `backend/.env` (or `ai-tutor/.env`) and set your IBM API key:

```env
IBM_API_KEY=your-ica-api-key-here
IBM_API_BASE=https://api.servicesessentials.ibm.com/v1
LLM_MODEL=gpt-4o          # or claude-haiku-5-5
```

### 2. Start the backend

```bash
cd backend
python -m venv .venv

# macOS / Linux
source .venv/bin/activate

# Windows
.venv\Scripts\activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`.

### 3. Start the frontend (new terminal)

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

> The Vite dev server proxies all `/api/*` requests to `localhost:8000`, so there are no CORS issues during development.

---

## Configuration

All backend configuration is via environment variables (loaded from `.env` with python-dotenv):

| Variable | Required | Default | Description |
|---|---|---|---|
| `IBM_API_KEY` | ✅ | — | ICA API key. Without this, chat and ingest will fail. |
| `IBM_API_BASE` | ✅ | `https://api.servicesessentials.ibm.com/v1` | Base URL for the ICA gateway. |
| `LLM_MODEL` | ✅ | `gpt-4o` | Model name as exposed by the ICA proxy (e.g. `gpt-4o`, `claude-haiku-5-5`). |

**No `OPENAI_API_KEY` or external embedding key is needed** — embeddings for clustering are computed locally via sentence-transformers.

---

## Project Structure

```
ai-tutor/
├── .env.example              # Environment variable template
├── README.md
├── backend/
│   ├── main.py               # FastAPI app, all route handlers
│   ├── models.py             # SQLAlchemy ORM models (Course, Document, Interaction, Cluster)
│   ├── database.py           # SQLite engine + session factory
│   ├── ingest.py             # PDF upload → ICA extraction → collection attachment
│   ├── rag.py                # Chat endpoint logic, source extraction, interaction logging
│   ├── cluster.py            # Local k-means clustering + LLM labelling for insights
│   ├── embeddings.py         # sentence-transformers wrapper (all-MiniLM-L6-v2)
│   └── requirements.txt
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.ts        # Dev proxy: /api → localhost:8000
    ├── tsconfig.json
    └── src/
        ├── main.tsx
        ├── App.tsx            # Role switcher (Student / Professor) + tab routing
        ├── api.ts             # Typed fetch wrappers for all backend endpoints
        ├── index.css          # Tailwind CSS entry
        ├── components/
        │   ├── ChatBubble.tsx         # Single message bubble with sources & feedback
        │   └── TransparencyBanner.tsx # "AI-generated content" notice
        └── views/
            ├── StudentChat.tsx        # Full chat UI with course selector & materials tab
            ├── ProfessorSettings.tsx  # Course management, PDF upload, tutor config
            └── InsightsDashboard.tsx  # Cluster chart and gap detection display
```

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Validates the IBM API key with a minimal LLM call. |
| `GET` | `/available-models` | Lists models available on the ICA proxy. |
| `GET` | `/courses` | List all courses. |
| `POST` | `/courses` | Create a course `{ name, tutor_prompt, socratic }`. |
| `PATCH` | `/courses/{id}` | Update `tutor_prompt` and/or `socratic` flag. |
| `DELETE` | `/courses/{id}` | Delete a course with all documents, interactions, and clusters. |
| `GET` | `/courses/{id}/documents` | List documents for a course. |
| `POST` | `/courses/{id}/ingest` | Upload a PDF (multipart). Triggers ICA extraction. |
| `DELETE` | `/courses/{id}/documents/{doc_id}` | Remove a document from ICA and local storage. |
| `POST` | `/chat` | Send a student question `{ course_id, session_id, question }`. Returns answer + sources. |
| `POST` | `/interactions/{id}/feedback` | Submit thumb feedback `{ value: 1 \| -1 }`. |
| `GET` | `/courses/{id}/insights` | Get (or recompute) clustered topic insights for a course. |

Uploaded PDFs are served statically at `/uploads/{course_id}_{filename}`.

---

## Responsible AI Design

This project was built with the following responsible AI principles in mind:

| Principle | Implementation |
|---|---|
| **Groundedness** | The LLM is instructed to answer only from provided documents. If a topic isn't found, it responds with a fixed "not covered" message rather than hallucinating. |
| **Transparency** | A persistent banner on the student chat screen discloses that responses are AI-generated and may contain errors. |
| **Source attribution** | Every answer includes cited snippets from the source documents, with links that open the PDF at the relevant passage. |
| **Socratic scaffolding** | Optional Socratic mode encourages active learning by prompting students to reason before receiving full explanations. |
| **Privacy** | Student sessions are identified by a random UUID stored in `localStorage` — no names, emails, or personal identifiers are collected. |
| **Aggregate-only analytics** | Professors see only clustered topic summaries and question counts — not individual student conversations. |
| **Human oversight** | Professors can review and update the tutor prompt, add or remove documents, and adjust the course scope at any time. |

---

## Development Notes

- **Database migrations**: SQLite does not support `ALTER TABLE … ADD COLUMN IF EXISTS`. The backend performs best-effort `ALTER TABLE` calls on startup to add new columns; errors are silently swallowed if the column already exists.
- **Clustering threshold**: The insights endpoint requires at least **3 logged questions** before it will attempt clustering. The cluster cache expires after **5 minutes**.
- **ICA polling**: After uploading a PDF, the backend polls the ICA files endpoint every 3 seconds (up to 40 attempts = 120 seconds) waiting for extraction to complete. If still pending after 120 s, it proceeds anyway — ICA will use whatever it has indexed.
- **Local embeddings**: Clustering uses `sentence-transformers/all-MiniLM-L6-v2` running entirely locally; no API key or network call is needed for the embedding step.
- **Source relevance threshold**: Only sources with a relevance score above `0.85` are returned to the student. This threshold can be adjusted in [`rag.py`](backend/rag.py).
