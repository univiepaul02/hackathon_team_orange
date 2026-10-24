// Typed API wrappers — all calls go through Vite's /api proxy

const BASE = '/api'

export interface Course {
  id: number
  name: string
  socratic: boolean
  tutor_prompt: string
}

export interface DocumentInfo {
  id: number
  filename: string
  num_pages: number
  num_chunks: number
  pdf_url?: string
}

export interface Source {
  filename: string
  page: number
  snippet: string
}

export interface ChatResponse {
  answer: string
  sources: Source[]
  interaction_id: number
}

export interface ClusterInfo {
  label: string
  size: number
  example_questions: string[]
  is_gap: boolean
}

export interface InsightsResponse {
  clusters: ClusterInfo[]
  total_questions: number
  gap_count: number
}

// ── Courses ───────────────────────────────────────────────────────────────────

export async function fetchCourses(): Promise<Course[]> {
  const r = await fetch(`${BASE}/courses`)
  if (!r.ok) throw new Error('Failed to fetch courses')
  return r.json()
}

export async function createCourse(
  name: string,
  tutor_prompt: string,
  socratic: boolean
): Promise<{ id: number; name: string }> {
  const r = await fetch(`${BASE}/courses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, tutor_prompt, socratic }),
  })
  if (!r.ok) throw new Error('Failed to create course')
  return r.json()
}

export async function deleteCourse(id: number): Promise<void> {
  const r = await fetch(`${BASE}/courses/${id}`, { method: 'DELETE' })
  if (!r.ok) throw new Error('Failed to delete course')
}

export async function updateCourse(
  id: number,
  patch: { tutor_prompt?: string; socratic?: boolean }
): Promise<void> {
  const r = await fetch(`${BASE}/courses/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!r.ok) throw new Error('Failed to update course')
}

// ── Documents ─────────────────────────────────────────────────────────────────

export async function fetchDocuments(courseId: number): Promise<DocumentInfo[]> {
  const r = await fetch(`${BASE}/courses/${courseId}/documents`)
  if (!r.ok) throw new Error('Failed to fetch documents')
  return r.json()
}

export async function deleteDocument(courseId: number, docId: number): Promise<void> {
  const r = await fetch(`${BASE}/courses/${courseId}/documents/${docId}`, { method: 'DELETE' })
  if (!r.ok) throw new Error('Failed to delete document')
}

export async function uploadPDF(
  courseId: number,
  file: File,
  onProgress?: (msg: string) => void
): Promise<{ doc_id: number; num_chunks: number; num_pages: number }> {
  onProgress?.('Uploading and indexing…')
  const form = new FormData()
  form.append('file', file)
  const r = await fetch(`${BASE}/courses/${courseId}/ingest`, {
    method: 'POST',
    body: form,
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'Upload failed' }))
    throw new Error(err.detail ?? 'Upload failed')
  }
  return r.json()
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export async function sendMessage(
  courseId: number,
  sessionId: string,
  question: string
): Promise<ChatResponse> {
  const r = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ course_id: courseId, session_id: sessionId, question }),
  })
  if (!r.ok) throw new Error('Chat request failed')
  return r.json()
}

export async function submitFeedback(interactionId: number, value: 1 | -1): Promise<void> {
  await fetch(`${BASE}/interactions/${interactionId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  })
}

// ── Insights ──────────────────────────────────────────────────────────────────

export async function fetchInsights(courseId: number): Promise<InsightsResponse> {
  const r = await fetch(`${BASE}/courses/${courseId}/insights`)
  if (!r.ok) throw new Error('Failed to fetch insights')
  return r.json()
}
