import json
import os
from datetime import datetime, timedelta
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from openai import OpenAI, AuthenticationError, APIConnectionError
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

import cluster as cluster_mod
import ingest as ingest_mod
import rag as rag_mod
from database import Base, engine, get_db
from models import Cluster, Course, Document, Interaction

load_dotenv()

# ── Startup ──────────────────────────────────────────────────────────────────

Base.metadata.create_all(bind=engine)

# Migrate: add new columns if they don't exist (SQLite doesn't support ADD COLUMN IF EXISTS)
with engine.connect() as conn:
    for col, typedef in [
        ("ica_collection_id", "TEXT"),
        ("ica_file_id", "TEXT"),
    ]:
        try:
            conn.execute(text(f"ALTER TABLE courses ADD COLUMN ica_collection_id TEXT"))
        except Exception:
            pass
        try:
            conn.execute(text(f"ALTER TABLE documents ADD COLUMN ica_file_id TEXT"))
        except Exception:
            pass
    conn.commit()

app = FastAPI(title="AI Tutor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_api_key = os.environ.get("IBM_API_KEY", os.environ.get("OPENAI_API_KEY", ""))
_api_base = os.environ.get("IBM_API_BASE", "https://api.servicesessentials.ibm.com/v1")
LLM_MODEL = os.environ.get("LLM_MODEL", "claude-haiku-5-5")

if not _api_key or _api_key == "your-new-key-here":
    import warnings
    warnings.warn(
        "IBM_API_KEY is not set. Set it in backend/.env before using chat/ingest/insights.",
        stacklevel=1,
    )

# ICA chat endpoint lives at /v1/chat-models/
_chat_base = f"{_api_base}/chat-models"
openai_client = OpenAI(api_key=_api_key or "placeholder", base_url=_chat_base)

UPLOAD_DIR = "./uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Serve uploaded PDFs at /uploads/<filename>
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class CourseCreate(BaseModel):
    name: str
    tutor_prompt: str = ""
    socratic: bool = True


class CourseUpdate(BaseModel):
    tutor_prompt: Optional[str] = None
    socratic: Optional[bool] = None


class ChatRequest(BaseModel):
    course_id: int
    session_id: str
    question: str


class FeedbackRequest(BaseModel):
    value: int  # 1 or -1


# ── Health / key check ────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    """Check that the IBM API key is valid with a minimal LLM call."""
    if not _api_key or _api_key == "your-new-key-here":
        return {"status": "error", "detail": "IBM_API_KEY is not set in backend/.env"}
    try:
        openai_client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=1,
        )
        return {"status": "ok"}
    except AuthenticationError:
        return {"status": "error", "detail": "IBM API key is invalid or expired (401). Update IBM_API_KEY in backend/.env"}
    except APIConnectionError as e:
        return {"status": "error", "detail": f"Cannot reach IBM API: {e}"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


# ── Models passthrough ────────────────────────────────────────────────────────

@app.get("/available-models")
def available_models():
    """List models available on the ICA proxy."""
    import httpx
    try:
        r = httpx.get(f"{_api_base}/chat-models/models", headers={"Authorization": f"Bearer {_api_key}"}, timeout=8)
        return r.json()
    except Exception as e:
        return {"error": str(e)}


# ── Courses ───────────────────────────────────────────────────────────────────

@app.get("/courses")
def list_courses(db: Session = Depends(get_db)):
    courses = db.query(Course).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "socratic": c.socratic,
            "tutor_prompt": c.tutor_prompt,
            "ica_collection_id": c.ica_collection_id,
        }
        for c in courses
    ]


@app.post("/courses", status_code=201)
def create_course(body: CourseCreate, db: Session = Depends(get_db)):
    course = Course(
        name=body.name,
        tutor_prompt=body.tutor_prompt,
        socratic=body.socratic,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return {"id": course.id, "name": course.name}


@app.delete("/courses/{course_id}", status_code=200)
def delete_course(course_id: int, db: Session = Depends(get_db)):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Remove all docs from ICA collection and delete local files
    docs = db.query(Document).filter_by(course_id=course_id).all()
    import httpx
    for doc in docs:
        if doc.ica_file_id and course.ica_collection_id:
            try:
                httpx.post(
                    f"{_api_base}/document-collections/{course.ica_collection_id}/file/remove",
                    headers={"Authorization": f"Bearer {_api_key}", "Content-Type": "application/json"},
                    json={"file_id": doc.ica_file_id},
                    timeout=10,
                )
            except Exception:
                pass
        local_path = os.path.join(UPLOAD_DIR, f"{course_id}_{doc.filename}")
        try:
            os.remove(local_path)
        except FileNotFoundError:
            pass
        db.delete(doc)

    # Delete ICA collection itself (best-effort)
    if course.ica_collection_id:
        try:
            httpx.delete(
                f"{_api_base}/document-collections/{course.ica_collection_id}",
                headers={"Authorization": f"Bearer {_api_key}"},
                timeout=10,
            )
        except Exception:
            pass

    # Delete related interactions and clusters
    db.query(Interaction).filter_by(course_id=course_id).delete()
    db.query(Cluster).filter_by(course_id=course_id).delete()
    db.delete(course)
    db.commit()
    return {"ok": True}


@app.patch("/courses/{course_id}")
def update_course(course_id: int, body: CourseUpdate, db: Session = Depends(get_db)):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if body.tutor_prompt is not None:
        course.tutor_prompt = body.tutor_prompt
    if body.socratic is not None:
        course.socratic = body.socratic
    db.commit()
    return {"ok": True}


# ── Documents / Ingestion ─────────────────────────────────────────────────────

@app.get("/courses/{course_id}/documents")
def list_documents(course_id: int, db: Session = Depends(get_db)):
    docs = db.query(Document).filter_by(course_id=course_id).all()
    return [
        {
            "id": d.id,
            "filename": d.filename,
            "num_pages": d.num_pages,
            "num_chunks": d.num_chunks,
            "ica_file_id": d.ica_file_id,
            "pdf_url": f"/uploads/{course_id}_{d.filename}",
        }
        for d in docs
    ]


@app.post("/courses/{course_id}/ingest", status_code=201)
async def ingest_document(
    course_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    # Save upload locally (needed for page count)
    save_path = os.path.join(UPLOAD_DIR, f"{course_id}_{file.filename}")
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    with open(save_path, "wb") as f:
        f.write(contents)

    try:
        result = ingest_mod.ingest_pdf(
            pdf_path=save_path,
            filename=file.filename,
            course_name=course.name,
            ica_collection_id=course.ica_collection_id,
            api_key=_api_key,
            api_base=_api_base,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {e}")

    # Persist collection ID on course (first upload creates it)
    if not course.ica_collection_id:
        course.ica_collection_id = result["ica_collection_id"]

    # Create Document record
    doc = Document(
        course_id=course_id,
        filename=file.filename,
        num_pages=result["num_pages"],
        num_chunks=0,  # ICA handles chunking internally
        ica_file_id=result["ica_file_id"],
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    return {
        "doc_id": doc.id,
        "num_pages": result["num_pages"],
        "ica_file_id": result["ica_file_id"],
        "ica_collection_id": result["ica_collection_id"],
    }


@app.delete("/courses/{course_id}/documents/{doc_id}", status_code=200)
def delete_document(course_id: int, doc_id: int, db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc or doc.course_id != course_id:
        raise HTTPException(status_code=404, detail="Document not found")

    # Remove from ICA collection if possible (best-effort)
    if doc.ica_file_id:
        course = db.get(Course, course_id)
        if course and course.ica_collection_id:
            import httpx
            try:
                httpx.post(
                    f"{_api_base}/document-collections/{course.ica_collection_id}/file/remove",
                    headers={"Authorization": f"Bearer {_api_key}", "Content-Type": "application/json"},
                    json={"file_id": doc.ica_file_id},
                    timeout=10,
                )
            except Exception:
                pass  # don't fail the delete if ICA call errors

    # Remove local file
    local_path = os.path.join(UPLOAD_DIR, f"{course_id}_{doc.filename}")
    try:
        os.remove(local_path)
    except FileNotFoundError:
        pass

    db.delete(doc)
    db.commit()
    return {"ok": True}


# ── Chat ──────────────────────────────────────────────────────────────────────

@app.post("/chat")
def chat_endpoint(body: ChatRequest, db: Session = Depends(get_db)):
    course = db.get(Course, body.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    result = rag_mod.chat(
        course=course,
        question=body.question,
        openai_client=openai_client,
        db_session=db,
        session_id=body.session_id,
        llm_model=LLM_MODEL,
    )
    return result


@app.post("/interactions/{interaction_id}/feedback")
def submit_feedback(
    interaction_id: int,
    body: FeedbackRequest,
    db: Session = Depends(get_db),
):
    if body.value not in (1, -1):
        raise HTTPException(status_code=400, detail="value must be 1 or -1")
    interaction = db.get(Interaction, interaction_id)
    if not interaction:
        raise HTTPException(status_code=404, detail="Interaction not found")
    interaction.feedback = body.value
    db.commit()
    return {"ok": True}


# ── Insights ──────────────────────────────────────────────────────────────────

CLUSTER_STALE_MINUTES = 5


@app.get("/courses/{course_id}/insights")
def get_insights(course_id: int, db: Session = Depends(get_db)):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    last_cluster = (
        db.query(Cluster)
        .filter_by(course_id=course_id)
        .order_by(Cluster.computed_at.desc())
        .first()
    )
    total_questions = db.query(Interaction).filter_by(course_id=course_id).count()
    stale = last_cluster is None or (
        datetime.utcnow() - last_cluster.computed_at
        > timedelta(minutes=CLUSTER_STALE_MINUTES)
    )

    if stale and total_questions >= 3:
        clusters_data = cluster_mod.compute_insights(
            course_id, db, openai_client,
            llm_model=LLM_MODEL,
        )
    else:
        cluster_rows = (
            db.query(Cluster)
            .filter_by(course_id=course_id)
            .order_by(Cluster.size.desc())
            .all()
        )
        clusters_data = [
            {
                "label": c.label,
                "size": c.size,
                "example_questions": json.loads(c.example_questions),
                "is_gap": c.is_gap,
            }
            for c in cluster_rows
        ]

    gap_count = sum(1 for c in clusters_data if c["is_gap"])

    return {
        "clusters": clusters_data,
        "total_questions": total_questions,
        "gap_count": gap_count,
    }
