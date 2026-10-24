import { useState } from 'react'
import StudentChat from './views/StudentChat'
import ProfessorSettings from './views/ProfessorSettings'
import InsightsDashboard from './views/InsightsDashboard'

type Role = 'student' | 'professor'
type ProfTab = 'settings' | 'insights'

export default function App() {
  const [role, setRole] = useState<Role>('student')
  const [profTab, setProfTab] = useState<ProfTab>('settings')

  return (
    <div className="min-h-screen bg-gray-100 flex items-start justify-center py-6 px-4">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col"
           style={{ minHeight: '90vh' }}>

        {/* Top nav */}
        <nav className="flex items-center justify-between px-5 py-3 bg-indigo-700 text-white">
          <span className="font-bold text-lg tracking-tight">🎓 AI Tutor</span>
          <div className="flex items-center gap-1 bg-indigo-800 rounded-full p-1">
            <button
              onClick={() => setRole('student')}
              className={`px-4 py-1 rounded-full text-sm font-medium transition-colors ${
                role === 'student'
                  ? 'bg-white text-indigo-700 shadow'
                  : 'text-indigo-200 hover:text-white'
              }`}
            >
              Student
            </button>
            <button
              onClick={() => setRole('professor')}
              className={`px-4 py-1 rounded-full text-sm font-medium transition-colors ${
                role === 'professor'
                  ? 'bg-white text-indigo-700 shadow'
                  : 'text-indigo-200 hover:text-white'
              }`}
            >
              Professor
            </button>
          </div>
        </nav>

        {/* Professor sub-tabs */}
        {role === 'professor' && (
          <div className="flex border-b border-gray-200 bg-gray-50">
            <button
              onClick={() => setProfTab('settings')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                profTab === 'settings'
                  ? 'border-b-2 border-indigo-600 text-indigo-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              ⚙️ Course Settings
            </button>
            <button
              onClick={() => setProfTab('insights')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                profTab === 'insights'
                  ? 'border-b-2 border-indigo-600 text-indigo-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              📊 Insights
            </button>
          </div>
        )}

        {/* Main content — StudentChat stays mounted to preserve chat history */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className={role === 'student' ? 'flex flex-col flex-1 overflow-hidden' : 'hidden'}>
            <StudentChat />
          </div>
          {role === 'professor' && profTab === 'settings' && <ProfessorSettings />}
          {role === 'professor' && profTab === 'insights' && <InsightsDashboard />}
        </div>

      </div>
    </div>
  )
}
