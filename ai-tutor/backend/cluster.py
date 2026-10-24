import json
from datetime import datetime
import numpy as np
from sklearn.cluster import KMeans
from models import Interaction, Cluster
import embeddings as emb_mod

N_CLUSTERS = 5


def compute_insights(
    course_id: int,
    db_session,
    openai_client,
    llm_model: str = "claude-haiku-5-5",
) -> list[dict]:
    """
    Embed all logged questions locally, cluster them with k-means,
    label each cluster with the LLM, and persist to the Cluster table.
    Returns the list of cluster dicts.
    """
    interactions = (
        db_session.query(Interaction).filter_by(course_id=course_id).all()
    )
    if len(interactions) < 3:
        return []

    questions = [i.question for i in interactions]

    # 1. Embed all questions locally (no API key needed)
    embeddings = np.array(emb_mod.embed(questions))

    # 2. k-means clustering (guard: k ≤ n)
    k = min(N_CLUSTERS, len(questions))
    kmeans = KMeans(n_clusters=k, random_state=42, n_init="auto")
    labels = kmeans.fit_predict(embeddings)

    # 3. Group interactions by cluster label
    cluster_map: dict[int, list] = {}
    for idx, label in enumerate(labels):
        cluster_map.setdefault(int(label), []).append(interactions[idx])

    # 4. LLM label + gap detection for each cluster
    results = []
    for label_idx, members in cluster_map.items():
        examples = [m.question for m in members[:5]]
        out_of_scope = sum(
            1
            for m in members
            if "doesn't appear to be covered" in (m.answer or "")
        )
        is_gap = len(members) > 0 and (out_of_scope / len(members)) > 0.5

        prompt = (
            "These are student questions from a university course. "
            "Give a short topic label (≤ 6 words) that summarises them:\n"
            + "\n".join(f"- {q}" for q in examples)
        )
        label_resp = openai_client.chat.completions.create(
            model=llm_model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=20,
        )
        cluster_label = label_resp.choices[0].message.content.strip().strip('*').strip()
        if not cluster_label:
            cluster_label = f"Topic {label_idx + 1}"

        results.append(
            {
                "label": cluster_label,
                "size": len(members),
                "example_questions": examples,
                "is_gap": is_gap,
            }
        )

    results.sort(key=lambda x: x["size"], reverse=True)

    # 5. Persist clusters (replace old ones for this course)
    db_session.query(Cluster).filter_by(course_id=course_id).delete()
    now = datetime.utcnow()
    for r in results:
        db_session.add(
            Cluster(
                course_id=course_id,
                label=r["label"],
                size=r["size"],
                example_questions=json.dumps(r["example_questions"]),
                is_gap=r["is_gap"],
                computed_at=now,
            )
        )
    db_session.commit()

    return results
