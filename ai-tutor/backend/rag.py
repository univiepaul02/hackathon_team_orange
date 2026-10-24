"""
RAG chat using ICA native document collections.

The ICA chat endpoint accepts a `files` array.  When a collection ID is
provided every answer is grounded in the uploaded documents and the response
includes a `sources` array with the retrieved chunks.
"""
import json
from datetime import datetime
from models import Interaction

SYSTEM_PROMPT = """\
You are an AI Tutor for a university course. You answer ONLY using the \
provided course documents. Cite your sources clearly.

Rules:
1. Cite every claim with the document name and page where possible.
2. If the answer is not in the provided material, reply EXACTLY:
   "I'm sorry, that topic doesn't appear to be covered in the course material."
   Do not guess or use outside knowledge.
3. Keep answers clear and concise (≤ 200 words unless the student asks to expand).
4. {socratic_instruction}
"""

SOCRATIC_ON = (
    "Use the Socratic method: give a guiding hint or ask a clarifying question "
    "first. Only provide the full explanation if the student explicitly asks for "
    "more detail or says they are stuck."
)
SOCRATIC_OFF = "Provide clear, direct explanations."


def chat(
    course,
    question: str,
    openai_client,
    db_session,
    session_id: str,
    llm_model: str = "claude-haiku-5-5",
) -> dict:
    socratic_instruction = SOCRATIC_ON if course.socratic else SOCRATIC_OFF
    system = SYSTEM_PROMPT.format(socratic_instruction=socratic_instruction)
    if course.tutor_prompt:
        system += f"\n\nAdditional instructor instructions:\n{course.tutor_prompt}"

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": question},
    ]

    # Extra ICA fields (files) must go through extra_body — OpenAI SDK rejects unknown kwargs
    extra: dict = {}
    if course.ica_collection_id:
        extra["files"] = [{"type": "collection", "id": course.ica_collection_id}]

    # Call ICA — openai_client already has base_url set to /v1/chat-models
    resp = openai_client.chat.completions.create(
        model=llm_model,
        messages=messages,
        max_tokens=2048,
        stream=False,
        extra_body=extra or None,
    )
    answer = resp.choices[0].message.content

    # Extract sources from ICA response extension (not in standard openai SDK)
    # Each source entry has parallel document[] and metadata[] arrays.
    sources = []
    seen = set()
    raw = resp.model_extra or {}
    for src in raw.get("sources", []):
        documents = src.get("document", [])
        metadatas = src.get("metadata", [])
        for i, chunk in enumerate(documents):
            meta = metadatas[i] if i < len(metadatas) else {}
            name = meta.get("name") or meta.get("source") or "unknown"
            score = meta.get("score", 0)
            # Only show high-relevance chunks (score > 0.85) and deduplicate by chunk hash
            chunk_hash = meta.get("_chunk_hash", chunk[:40])
            if score < 0.85 or chunk_hash in seen:
                continue
            seen.add(chunk_hash)
            sources.append({
                "filename": name,
                "page": meta.get("start_index", 0),
                "snippet": chunk[:150] + "…" if len(chunk) > 150 else chunk,
                "full_text": chunk,
                "score": round(score, 3),
            })
    # Keep top 5 by score
    sources = sorted(sources, key=lambda x: x["score"], reverse=True)[:5]

    # Log interaction
    interaction = Interaction(
        course_id=course.id,
        session_id=session_id,
        question=question,
        answer=answer,
        sources=json.dumps(sources),
        timestamp=datetime.utcnow(),
    )
    db_session.add(interaction)
    db_session.commit()
    db_session.refresh(interaction)

    return {"answer": answer, "sources": sources, "interaction_id": interaction.id}
