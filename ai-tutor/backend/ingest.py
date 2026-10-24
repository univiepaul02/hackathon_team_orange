"""
ICA-native document ingestion.

Flow:
  1. POST /files  → upload the PDF, get file_id
  2. Poll GET /files/{file_id} until data.status == "completed"
  3. Ensure the course has an ICA document collection (create one if needed)
  4. POST /document-collections/{id}/file/add  → attach file to collection
"""
import time
import pymupdf

ICA_FILES_URL = "{base}/files"
ICA_COLLECTION_URL = "{base}/document-collections"


def count_pages(pdf_path: str) -> int:
    doc = pymupdf.open(pdf_path)
    n = doc.page_count
    doc.close()
    return n


def ingest_pdf(
    pdf_path: str,
    filename: str,
    course_name: str,
    ica_collection_id: str | None,
    api_key: str,
    api_base: str,
) -> dict:
    """
    Upload a PDF to ICA, wait for extraction, attach to the course collection.

    Returns:
        {
            "ica_file_id": str,
            "ica_collection_id": str,   # created or existing
            "num_pages": int,
        }
    """
    import httpx

    headers = {"Authorization": f"Bearer {api_key}"}

    # 1. Upload file
    with open(pdf_path, "rb") as fh:
        resp = httpx.post(
            f"{api_base}/files",
            headers=headers,
            files={"file": (filename, fh, "application/pdf")},
            timeout=60,
        )
    resp.raise_for_status()
    file_obj = resp.json()
    file_id = file_obj["id"]

    # 2. Poll until extraction completed (up to 120 s)
    for _ in range(40):
        time.sleep(3)
        status_resp = httpx.get(f"{api_base}/files/{file_id}", headers=headers, timeout=15)
        status_resp.raise_for_status()
        status = status_resp.json().get("data", {}).get("status", "pending")
        if status == "completed":
            break
    # (proceed even if still pending — ICA will use what it has)

    # 3. Ensure collection exists
    if not ica_collection_id:
        col_resp = httpx.post(
            f"{api_base}/document-collections",
            headers={**headers, "Content-Type": "application/json"},
            json={"name": course_name, "description": f"AI Tutor collection for {course_name}"},
            timeout=15,
        )
        col_resp.raise_for_status()
        ica_collection_id = col_resp.json()["id"]

    # 4. Add file to collection
    httpx.post(
        f"{api_base}/document-collections/{ica_collection_id}/file/add",
        headers={**headers, "Content-Type": "application/json"},
        json={"file_id": file_id},
        timeout=15,
    ).raise_for_status()

    return {
        "ica_file_id": file_id,
        "ica_collection_id": ica_collection_id,
        "num_pages": count_pages(pdf_path),
    }
