import { useEffect, useState, useCallback } from 'react'
import {
  fetchCourses,
  createCourse,
  deleteCourse,
  updateCourse,
  fetchDocuments,
  uploadPDF,
  deleteDocument,
} from '../api'
import type { Course, DocumentInfo } from '../api'

export default function ProfessorSettings() {
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [documents, setDocuments] = useState<DocumentInfo[]>([])

  // New course form
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  // Settings form
  const [tutorPrompt, setTutorPrompt] = useState('')
  const [socratic, setSocratic] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deletingCourseId, setDeletingCourseId] = useState<number | null>(null)

  // API key health warning
  const [apiKeyWarning, setApiKeyWarning] = useState<string | null>(null)

  const loadCourses = useCallback(async () => {
    const cs = await fetchCourses()
    setCourses(cs)
    return cs
  }, [])

  useEffect(() => {
    loadCourses().catch(() => setError('Failed to load courses'))
  }, [loadCourses])

  // Check API key on mount
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        if (data.status !== 'ok') {
          setApiKeyWarning(data.detail ?? 'API key check failed')
        }
      })
      .catch(() => {/* backend not reachable — will surface on actual upload */})
  }, [])

  const selectCourse = useCallback(async (c: Course) => {
    setSelectedCourse(c)
    setTutorPrompt(c.tutor_prompt)
    setSocratic(c.socratic)
    setSaveMsg(null)
    const docs = await fetchDocuments(c.id).catch(() => [])
    setDocuments(docs)
  }, [])

  // Auto-select first course
  useEffect(() => {
    if (courses.length > 0 && !selectedCourse) selectCourse(courses[0])
  }, [courses, selectedCourse, selectCourse])

  const handleCreateCourse = async () => {
    if (!newName.trim()) return
    setCreating(true)
    setError(null)
    try {
      await createCourse(newName.trim(), '', true)
      setNewName('')
      const cs = await loadCourses()
      const latest = cs[cs.length - 1]
      if (latest) await selectCourse(latest)
    } catch {
      setError('Failed to create course')
    } finally {
      setCreating(false)
    }
  }

  const handleSaveSettings = async () => {
    if (!selectedCourse) return
    setSaving(true)
    setSaveMsg(null)
    try {
      await updateCourse(selectedCourse.id, { tutor_prompt: tutorPrompt, socratic })
      setSaveMsg('Settings saved ✓')
      const cs = await loadCourses()
      const updated = cs.find((c) => c.id === selectedCourse.id)
      if (updated) setSelectedCourse(updated)
    } catch {
      setError('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedCourse) return
    e.target.value = '' // reset so the same file can be re-selected
    setUploading(true)
    setUploadMsg('Uploading and indexing…')
    setError(null)
    try {
      const res = await uploadPDF(selectedCourse.id, file)
      setUploadMsg(`✓ ${file.name} — ${res.num_pages} pages, ${res.num_chunks} chunks indexed`)
      const docs = await fetchDocuments(selectedCourse.id)
      setDocuments(docs)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setUploadMsg(null)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Course sidebar */}
      <aside className="w-56 border-r border-gray-200 bg-gray-50 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Courses</p>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {courses.map((c) => (
            <li key={c.id} className="flex items-center group">
              <button
                onClick={() => selectCourse(c)}
                className={`flex-1 text-left px-4 py-2.5 text-sm truncate transition-colors ${
                  selectedCourse?.id === c.id
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                {c.name}
              </button>
              <button
                onClick={async () => {
                  if (!window.confirm(`Delete "${c.name}" and all its documents?`)) return
                  setDeletingCourseId(c.id)
                  setError(null)
                  try {
                    await deleteCourse(c.id)
                    // Clear localStorage chat history for this course
                    localStorage.removeItem(`ai_tutor_chat_${c.id}`)
                    const remaining = await loadCourses()
                    if (selectedCourse?.id === c.id) {
                      if (remaining.length > 0) await selectCourse(remaining[0])
                      else { setSelectedCourse(null); setDocuments([]) }
                    }
                  } catch {
                    setError('Failed to delete course')
                  } finally {
                    setDeletingCourseId(null)
                  }
                }}
                disabled={deletingCourseId === c.id}
                title="Delete course"
                className="pr-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 disabled:opacity-40 transition-all shrink-0"
              >
                {deletingCourseId === c.id ? '⏳' : '🗑️'}
              </button>
            </li>
          ))}
        </ul>
        {/* New course */}
        <div className="p-3 border-t border-gray-200">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateCourse()}
            placeholder="New course name…"
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            onClick={handleCreateCourse}
            disabled={creating || !newName.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg py-1.5 text-xs font-semibold transition-colors"
          >
            {creating ? 'Creating…' : '+ Create Course'}
          </button>
        </div>
      </aside>

      {/* Main settings panel */}
      <main className="flex-1 overflow-y-auto px-6 py-5">
        {apiKeyWarning && (
          <div className="mb-4 bg-amber-50 border border-amber-300 text-amber-800 text-sm px-4 py-2 rounded-lg flex items-start gap-2">
            <span className="text-base shrink-0">⚠️</span>
            <span>
              <strong>API key issue:</strong> {apiKeyWarning}
              <br />
              <span className="text-xs">PDF upload and chat will fail until the key is fixed.</span>
            </span>
          </div>
        )}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-300 text-red-700 text-sm px-4 py-2 rounded-lg">
            {error}
          </div>
        )}

        {!selectedCourse ? (
          <p className="text-gray-400 text-sm mt-10 text-center">
            Create or select a course to get started.
          </p>
        ) : (
          <>
            <h2 className="text-xl font-bold text-gray-800 mb-5">{selectedCourse.name}</h2>

            {/* Tutor prompt */}
            <label className="block mb-1 text-sm font-semibold text-gray-700">
              Tutor prompt{' '}
              <span className="font-normal text-gray-500">(behaviour &amp; scope)</span>
            </label>
            <textarea
              value={tutorPrompt}
              onChange={(e) => setTutorPrompt(e.target.value)}
              rows={4}
              placeholder="e.g. Only answer questions about supervised learning. Encourage step-by-step reasoning."
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-4"
            />

            {/* Socratic toggle */}
            <div className="flex items-center gap-3 mb-5">
              <span className="text-sm font-semibold text-gray-700">Socratic mode</span>
              <button
                onClick={() => setSocratic((v) => !v)}
                className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors ${
                  socratic ? 'bg-indigo-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
                    socratic ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-xs text-gray-500">
                {socratic ? 'ON — students get hints first' : 'OFF — direct answers'}
              </span>
            </div>

            {saveMsg && (
              <p className="text-green-600 text-sm mb-3">{saveMsg}</p>
            )}

            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl px-5 py-2 text-sm font-semibold transition-colors mb-8"
            >
              {saving ? 'Saving…' : 'Save Settings'}
            </button>

            {/* PDF upload */}
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Upload Course Documents</h3>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 hover:border-indigo-400 rounded-xl p-6 cursor-pointer transition-colors mb-3">
                <span className="text-3xl mb-2">📂</span>
                <span className="text-sm text-gray-600">
                  {uploading ? 'Uploading…' : 'Drop a PDF here or click to browse'}
                </span>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              {uploadMsg && (
                <p className="text-sm text-green-600 mb-3">{uploadMsg}</p>
              )}

              {documents.length > 0 && (
                <ul className="space-y-2">
                  {documents.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2 border border-gray-100"
                    >
                      <span className="text-base">📄</span>
                      <span className="font-medium text-gray-800 truncate flex-1">{d.filename}</span>
                      <span className="text-gray-500 text-xs shrink-0">
                        {d.num_pages} pages
                      </span>
                      <button
                        onClick={async () => {
                          if (!selectedCourse) return
                          setDeletingId(d.id)
                          setError(null)
                          try {
                            await deleteDocument(selectedCourse.id, d.id)
                            setDocuments((prev) => prev.filter((x) => x.id !== d.id))
                          } catch {
                            setError('Failed to remove document')
                          } finally {
                            setDeletingId(null)
                          }
                        }}
                        disabled={deletingId === d.id}
                        title="Remove document"
                        className="ml-1 text-gray-400 hover:text-red-500 disabled:opacity-40 transition-colors shrink-0"
                      >
                        {deletingId === d.id ? '⏳' : '🗑️'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
