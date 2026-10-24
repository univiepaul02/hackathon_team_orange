# AI Tutor

A Responsible AI web platform where an LLM-based tutor discusses lecture content with students — grounded exclusively in professor-provided PDFs, with Socratic mode and aggregate insights for professors.

## Quick Start

### 1. Configure secrets

```bash
cp .env.example .env
# Set OPENAI_API_KEY=sk-... in .env
```

### 2. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend (new terminal)

```bash
cd frontend
npm install
npm run dev   # → http://localhost:5173
```

## Features

- **Professor view** — create courses, upload PDFs, set tutor prompt, toggle Socratic mode
- **Student view** — chat with grounded AI tutor, see page citations, give feedback
- **Insights dashboard** — cluster student questions by topic, detect content gaps
- **Responsible AI** — transparency banner, Socratic scaffolding, pseudonymised sessions, aggregate-only data

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11 + FastAPI |
| Vector store | ChromaDB (embedded) |
| Database | SQLite + SQLAlchemy |
| PDF parsing | PyMuPDF |
| LLM + Embeddings | OpenAI gpt-4o-mini + text-embedding-3-small |
| Clustering | scikit-learn KMeans |
| Frontend | React 18 + Vite + Tailwind CSS v4 |
| Charts | Recharts |
