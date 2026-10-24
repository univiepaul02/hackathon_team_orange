import { useState } from 'react'
import { submitFeedback } from '../api'
import type { Source } from '../api'

interface Props {
  role: 'student' | 'tutor'
  text: string
  sources?: Source[]
  interactionId?: number
  question?: string
  onOpenSource?: (filename: string, searchText: string) => void
}

interface RichSource extends Source {
  full_text?: string
  score?: number
}

function SourceItem({
  s,
  query,
  onOpenSource,
}: {
  s: RichSource
  query: string
  onOpenSource?: (filename: string, searchText: string) => void
}) {
  const [open, setOpen] = useState(false)

  // Highlight every word from the query that appears in the full text
  const highlight = (text: string) => {
    if (!query) return text
    const words = query
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    if (words.length === 0) return text
    const pattern = new RegExp(`(${words.join('|')})`, 'gi')
    const parts = text.split(pattern)
    return parts.map((part, i) =>
      pattern.test(part) ? (
        <mark key={i} className="bg-yellow-200 text-gray-900 rounded px-0.5">
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      )
    )
  }

  return (
    <li className="text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded-lg border transition-colors ${
          open
            ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
            : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700'
        }`}
      >
        <span className="text-base leading-none">{open ? '📖' : '📄'}</span>
        <span className="font-medium truncate flex-1">{s.filename}</span>
        {s.score !== undefined && (
          <span className="text-gray-400 shrink-0">{Math.round(s.score * 100)}%</span>
        )}
        <span className="text-gray-400 shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && s.full_text && (
        <div className="mt-1 border border-yellow-300 rounded-lg bg-yellow-50 p-2.5">
          <p className="text-xs text-yellow-700 font-semibold mb-1.5 flex items-center gap-1">
            🔍 Relevant passage
            {onOpenSource && (
              <button
                onClick={() => onOpenSource(s.filename, s.full_text!)}
                className="ml-auto text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 hover:underline"
                title="Open PDF at this section"
              >
                Open in PDF →
              </button>
            )}
          </p>
          <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
            {highlight(s.full_text)}
          </p>
        </div>
      )}
    </li>
  )
}

export default function ChatBubble({ role, text, sources = [], interactionId, question, onOpenSource }: Props) {
  const [feedback, setFeedback] = useState<1 | -1 | null>(null)

  const handleFeedback = async (val: 1 | -1) => {
    if (feedback !== null || !interactionId) return
    setFeedback(val)
    await submitFeedback(interactionId, val).catch(console.error)
  }

  const isStudent = role === 'student'

  // Use the student's question to highlight relevant terms in the source passage
  const highlightQuery = question ?? text

  return (
    <div className={`flex ${isStudent ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
          isStudent
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
        }`}
      >
        {!isStudent && (
          <div className="flex items-center gap-1 mb-1 text-xs font-semibold text-indigo-600">
            🤖 AI Tutor
          </div>
        )}

        {/* Message text */}
        <p className="whitespace-pre-wrap leading-relaxed">{text}</p>

        {/* Sources */}
        {!isStudent && sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-1.5">
              📎 Sources <span className="font-normal text-gray-400">— click any to expand</span>
            </p>
            <ul className="space-y-1">
              {(sources as RichSource[]).map((s, i) => (
                <SourceItem key={i} s={s} query={highlightQuery} onOpenSource={onOpenSource} />
              ))}
            </ul>
          </div>
        )}

        {/* Feedback buttons */}
        {!isStudent && interactionId && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => handleFeedback(1)}
              disabled={feedback !== null}
              title="Helpful"
              className={`text-base transition-opacity ${
                feedback === null ? 'hover:opacity-70 cursor-pointer' : 'cursor-default'
              } ${feedback === 1 ? 'opacity-100' : feedback === -1 ? 'opacity-30' : 'opacity-60'}`}
            >
              👍
            </button>
            <button
              onClick={() => handleFeedback(-1)}
              disabled={feedback !== null}
              title="Not helpful"
              className={`text-base transition-opacity ${
                feedback === null ? 'hover:opacity-70 cursor-pointer' : 'cursor-default'
              } ${feedback === -1 ? 'opacity-100' : feedback === 1 ? 'opacity-30' : 'opacity-60'}`}
            >
              👎
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
