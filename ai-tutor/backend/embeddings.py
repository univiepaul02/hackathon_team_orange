"""
Local embedding helper using sentence-transformers.

Uses all-MiniLM-L6-v2 (22 MB, 384-dim) — runs fully offline, no API key needed.
The model is downloaded once on first use and cached in ~/.cache/torch/sentence_transformers.
"""
from sentence_transformers import SentenceTransformer

_MODEL_NAME = "all-MiniLM-L6-v2"
_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(_MODEL_NAME)
    return _model


def embed(texts: list[str]) -> list[list[float]]:
    """Return a list of float embeddings for the given texts."""
    model = _get_model()
    vecs = model.encode(texts, show_progress_bar=False, convert_to_numpy=True)
    return vecs.tolist()
