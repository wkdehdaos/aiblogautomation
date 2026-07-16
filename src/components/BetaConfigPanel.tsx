'use client'

import { useState } from 'react'

export default function BetaConfigPanel({ initialMaxUsers }: { initialMaxUsers: number }) {
  const [input, setInput] = useState(String(initialMaxUsers))
  const [currentMax, setCurrentMax] = useState(initialMaxUsers)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    const val = Number(input)
    if (!val || val < 1) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/beta-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxUsers: val }),
      })
      if (res.ok) {
        const data = await res.json() as { maxUsers: number }
        setCurrentMax(data.maxUsers)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={1}
        value={input}
        onChange={e => setInput(e.target.value)}
        className="w-20 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-indigo-400"
      />
      <span className="text-xs text-gray-400">명</span>
      <button
        onClick={handleSave}
        disabled={saving || Number(input) === currentMax || !Number(input)}
        className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50"
      >
        {saving ? '저장 중...' : saved ? '✓ 저장됨' : '변경'}
      </button>
    </div>
  )
}
