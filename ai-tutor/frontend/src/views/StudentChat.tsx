import { useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { fetchCourses, fetchDocuments, sendMessage } from '../api'
import type { Course, DocumentInfo, Source } from '../api'
import ChatBubble from '../components/ChatBubble'
import TransparencyBanner from '../components/TransparencyBanner'

interface Message {
  role: 'student' | 'tutor'
  text: string
  sources?: Source[]
  interactionId?: number
  question?: string  // the student question that triggered this tutor reply
}

const STORAGE_KEY = 'ai_tutor_chat'
const SESSION_KEY = 'ai_tutor_session'

// Persist session ID across refreshes
function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) { id = uuidv4(); localStorage.setItem(SESSION_KEY, id) }
  return id
}

const SESSION_ID = getSessionId()

function loadMessages(courseId: number): Message[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${courseId}`)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveMessages(courseId: number, msgs: Message[]) {
  localStorage.setItem(`${STORAGE_KEY}_${courseId}`, JSON.stringify(msgs))
}

export default function StudentChat() {
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [documents, setDocuments] = useState<DocumentInfo[]>([])
  const [tab, setTab] = useState<'chat' | 'materials'>('chat')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Open a source PDF in a new tab, jumping to the relevant text via #search fragment
  const openSourceInPdf = (filename: string, searchText: string) => {
    const doc = documents.find((d) => d.filename === filename)
    if (!doc?.pdf_url) return
    const fragment = searchText
      ? '#search=' + encodeURIComponent(searchText.split(/\s+/).slice(0, 8).join(' '))
      : ''
    window.open(`/api${doc.pdf_url}${fragment}`, '_blank', 'noopener,noreferrer')
  }

  useEffect(() => {
    fetchCourses()
      .then((cs) => {
        setCourses(cs)
        const stored = localStorage.getItem('ai_tutor_course')
        const id = stored ? Number(stored) : cs[0]?.id ?? null
        setSelectedCourseId(id)
      })
      .catch(() => setError('Could not load courses'))
  }, [])

  // Load messages + documents when course changes
  useEffect(() => {
    if (selectedCourseId !== null) {
      setMessages(loadMessages(selectedCourseId))
      fetchDocuments(selectedCourseId).then(setDocuments).catch(() => setDocuments([]))
    }
  }, [selectedCourseId])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const setAndPersistMessages = (courseId: number, updater: (prev: Message[]) => Message[]) => {
    setMessages((prev) => {
      const next = updater(prev)
      saveMessages(courseId, next)
      return next
    })
  }

  const handleSend = async () => {
    const q = input.trim()
    if (!q || !selectedCourseId || loading) return
    setInput('')
    setAndPersistMessages(selectedCourseId, (prev) => [...prev, { role: 'student', text: q }])
    setLoading(true)
    setError(null)
    try {
      const res = await sendMessage(selectedCourseId, SESSION_ID, q)
      setAndPersistMessages(selectedCourseId, (prev) => [
        ...prev,
        {
          role: 'tutor',
          text: res.answer,
          sources: res.sources,
          interactionId: res.interaction_id,
          question: q,
        },
      ])
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const activeCourse = courses.find((c) => c.id === selectedCourseId) ?? null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center gap-3">
        <span className="text-lg font-bold text-indigo-700">🎓 AI Tutor</span>
        {/* Socratic mode badge */}
        {activeCourse && (
          <span
            title={activeCourse.socratic ? 'Tutor gives hints first — ask for more detail if needed' : 'Tutor gives direct answers'}
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              activeCourse.socratic
                ? 'bg-purple-100 text-purple-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {activeCourse.socratic ? '💡 Socratic mode' : '💬 Direct mode'}
          </span>
        )}
        <select
          value={selectedCourseId ?? ''}
          onChange={(e) => {
            const id = Number(e.target.value)
            localStorage.setItem('ai_tutor_course', String(id))
            setSelectedCourseId(id)
          }}
          className="ml-auto border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          {courses.length === 0 && <option value="">No courses yet</option>}
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-gray-200 bg-gray-50 shrink-0">
        <button
          onClick={() => setTab('chat')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            tab === 'chat'
              ? 'border-b-2 border-indigo-600 text-indigo-700 bg-white'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          💬 Chat
        </button>
        <button
          onClick={() => setTab('materials')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            tab === 'materials'
              ? 'border-b-2 border-indigo-600 text-indigo-700 bg-white'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          📚 Course Materials {documents.length > 0 && <span className="ml-1 text-xs text-gray-400">({documents.length})</span>}
        </button>
      </div>

      {/* Transparency banner */}
      {tab === 'chat' && (
        <div className="px-4 pt-3 shrink-0">
          <TransparencyBanner />
        </div>
      )}

      {/* Materials tab */}
      {tab === 'materials' && (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {documents.length === 0 ? (
            <p className="text-center text-gray-400 text-sm mt-10">
              No documents uploaded yet. Ask your professor to add course materials.
            </p>
          ) : (
            <ul className="space-y-2">
              {documents.map((d) => (
                <li key={d.id} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                  <span className="text-2xl">📄</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{d.filename}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{d.num_pages} pages · indexed by AI Tutor</p>
                  </div>
                  {d.pdf_url && (
                    <a
                      href={`/api${d.pdf_url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                    >
                      ↗ View
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Chat history */}
      {tab === 'chat' && (
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.length === 0 && !loading && (
          <p className="text-center text-gray-400 text-sm mt-10">
            Ask your first question about the course material!
          </p>
        )}
        {messages.map((m, i) => (
          <ChatBubble
            key={i}
            role={m.role}
            text={m.text}
            sources={m.sources}
            interactionId={m.interactionId}
            question={m.question}
            onOpenSource={openSourceInPdf}
          />
        ))}
        {loading && (
          <div className="flex justify-start mb-3">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-400 shadow-sm animate-pulse">
              Thinking…
            </div>
          </div>
        )}
        {error && (
          <p className="text-center text-red-500 text-sm">{error}</p>
        )}
        <div ref={bottomRef} />
      </div>
      )}

      {/* Input — only shown on chat tab */}
      <div className={`px-4 pb-4 pt-2 border-t border-gray-200 bg-white flex gap-2 ${tab !== 'chat' ? 'hidden' : ''}`}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your question… (Enter to send)"
          rows={2}
          disabled={loading || !selectedCourseId}
          className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim() || !selectedCourseId}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
        >
          Send ▶
        </button>
      </div>
    </div>
  )
}
