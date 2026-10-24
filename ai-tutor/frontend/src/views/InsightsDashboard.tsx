import { useEffect, useState } from 'react'
import { fetchCourses, fetchInsights } from '../api'
import type { Course, InsightsResponse } from '../api'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

const CLUSTER_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#14b8a6',
]

export default function InsightsDashboard() {
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const [insights, setInsights] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchCourses()
      .then((cs) => {
        setCourses(cs)
        if (cs.length > 0) setSelectedCourseId(cs[0].id)
      })
      .catch(() => setError('Failed to load courses'))
  }, [])

  const loadInsights = async (courseId: number) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchInsights(courseId)
      setInsights(data)
    } catch {
      setError('Failed to load insights. Make sure the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedCourseId) loadInsights(selectedCourseId)
  }, [selectedCourseId])

  const chartData = insights?.clusters.map((c) => ({
    name: c.label.length > 20 ? c.label.slice(0, 18) + '…' : c.label,
    questions: c.size,
    is_gap: c.is_gap,
  })) ?? []

  return (
    <div className="flex flex-col h-full overflow-y-auto px-6 py-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold text-gray-800">📊 Insights Dashboard</h2>
        <div className="flex items-center gap-3">
          <select
            value={selectedCourseId ?? ''}
            onChange={(e) => setSelectedCourseId(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => selectedCourseId && loadInsights(selectedCourseId)}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors"
          >
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Privacy notice */}
      <div className="bg-blue-50 border border-blue-200 text-blue-700 text-xs px-4 py-2 rounded-lg mb-5 flex items-start gap-2">
        <span className="shrink-0">ℹ️</span>
        <span>
          Data is <strong>aggregated and pseudonymised</strong>. No individual students are tracked.
          Session IDs are random and never linked to personal identity.
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 text-sm px-4 py-2 rounded-lg mb-4">
          {error}
        </div>
      )}

      {loading && (
        <p className="text-gray-400 text-sm text-center mt-10 animate-pulse">
          Clustering questions…
        </p>
      )}

      {!loading && insights && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <StatCard label="Total Questions" value={insights.total_questions} color="indigo" />
            <StatCard label="Topic Clusters" value={insights.clusters.length} color="purple" />
            <StatCard label="Content Gaps" value={insights.gap_count} color="amber" />
          </div>

          {/* Not enough questions yet */}
          {insights.total_questions < 3 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-8 text-center mb-6">
              <p className="text-3xl mb-2">💬</p>
              <p className="text-sm font-semibold text-gray-700 mb-1">Not enough data yet</p>
              <p className="text-xs text-gray-500">
                {insights.total_questions === 0
                  ? 'No student questions recorded for this course yet.'
                  : `${insights.total_questions} question${insights.total_questions > 1 ? 's' : ''} recorded — need at least 3 to generate clusters.`}
              </p>
              <p className="text-xs text-gray-400 mt-2">Ask students to start chatting with the tutor.</p>
            </div>
          )}

          {/* Bar chart */}
          {chartData.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Questions by Topic Cluster</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: number) => [`${value} questions`, 'Count']}
                  />
                  <Bar dataKey="questions" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.is_gap ? '#f59e0b' : CLUSTER_COLORS[index % CLUSTER_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-gray-400 mt-1">🟡 Yellow = content gap cluster</p>
            </div>
          )}

          {/* Cluster cards */}
          {insights.clusters.length > 0 && (
            <div className="space-y-3 mb-6">
              <h3 className="text-sm font-semibold text-gray-700">Topic Clusters</h3>
              {insights.clusters.map((c, i) => (
                <div
                  key={i}
                  className={`bg-white border rounded-xl p-4 ${
                    c.is_gap ? 'border-amber-300' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{
                        backgroundColor: c.is_gap
                          ? '#f59e0b'
                          : CLUSTER_COLORS[i % CLUSTER_COLORS.length],
                      }}
                    />
                    <span className="font-semibold text-gray-800 text-sm">{c.label}</span>
                    {c.is_gap && (
                      <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                        ⚠ Content gap
                      </span>
                    )}
                    <span className="ml-auto text-xs text-gray-500 font-medium">
                      {c.size} question{c.size !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <ul className="space-y-1 pl-5 list-disc">
                    {c.example_questions.slice(0, 3).map((q, j) => (
                      <li key={j} className="text-xs text-gray-600 italic">
                        "{q}"
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!loading && !insights && !error && (
        <p className="text-gray-400 text-sm text-center mt-10">Select a course to view insights.</p>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: 'indigo' | 'purple' | 'amber'
}) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
  }
  return (
    <div className={`rounded-xl border px-4 py-3 text-center ${colors[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium mt-0.5 opacity-80">{label}</p>
    </div>
  )
}
