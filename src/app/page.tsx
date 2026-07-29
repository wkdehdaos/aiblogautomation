'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type ToneOption = 'friendly' | 'professional' | 'informative'

interface PhotoItem {
  id: string
  file: File
  previewUrl: string
}

interface BlogFormData {
  businessName: string
  businessInfo: string
  photos: PhotoItem[]
  keywords: string[]
  tone: ToneOption
  seoOptimize: boolean
}

interface GenerateResult {
  title: string
  content: string
  photos: PhotoItem[]
}

const INITIAL_FORM: BlogFormData = {
  businessName: '',
  businessInfo: '',
  photos: [],
  keywords: [],
  tone: 'friendly',
  seoOptimize: false,
}

function renderContentWithImages(
  content: string,
  photos: PhotoItem[],
  mosaicUrls: Record<string, string>,
  mosaicEnabled: Set<string>,
): string {
  let rendered = content
  photos.forEach((photo, i) => {
    const src = mosaicEnabled.has(photo.id) && mosaicUrls[photo.id] ? mosaicUrls[photo.id] : photo.previewUrl
    rendered = rendered.replace(
      new RegExp(`<!--\\s*IMAGE_${i + 1}\\s*-->`, 'gi'),
      `<img src="${src}" alt="사진 ${i + 1}" style="width:100%;border-radius:8px;margin:12px 0;" />`,
    )
  })
  return rendered
}

async function svgBlobToJpeg(svgBlob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(svgBlob)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth || 400
      canvas.height = img.naturalHeight || 300
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob(blob => resolve(blob ?? svgBlob), 'image/jpeg', 0.9)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(svgBlob) }
    img.src = url
  })
}

function pixelateRegion(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, blockSize: number) {
  const x0 = Math.max(0, Math.floor(x))
  const y0 = Math.max(0, Math.floor(y))
  const x1 = Math.min(ctx.canvas.width, Math.floor(x + w))
  const y1 = Math.min(ctx.canvas.height, Math.floor(y + h))
  const rw = x1 - x0, rh = y1 - y0
  if (rw <= 0 || rh <= 0) return
  const data = ctx.getImageData(x0, y0, rw, rh)
  const d = data.data
  for (let row = 0; row < rh; row += blockSize) {
    for (let col = 0; col < rw; col += blockSize) {
      const i = (row * rw + col) * 4
      const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3]
      for (let dr = 0; dr < blockSize && row + dr < rh; dr++) {
        for (let dc = 0; dc < blockSize && col + dc < rw; dc++) {
          const j = ((row + dr) * rw + (col + dc)) * 4
          d[j] = r; d[j + 1] = g; d[j + 2] = b; d[j + 3] = a
        }
      }
    }
  }
  ctx.putImageData(data, x0, y0)
}

function applyMosaicToImage(
  previewUrl: string,
  faces: Array<{ x: number; y: number; w: number; h: number }>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(previewUrl); return }
      ctx.drawImage(img, 0, 0)
      if (faces.length > 0) {
        for (const f of faces) {
          pixelateRegion(ctx, (f.x / 100) * canvas.width, (f.y / 100) * canvas.height, (f.w / 100) * canvas.width, (f.h / 100) * canvas.height, 16)
        }
      } else {
        pixelateRegion(ctx, 0, 0, canvas.width, canvas.height, 16)
      }
      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    img.onerror = reject
    img.src = previewUrl
  })
}

const SL = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-3 mt-4 text-[11px] font-medium uppercase tracking-widest" style={{ color: '#6366f1' }}>
    {children}
  </p>
)

export default function BlogFormPage() {
  const router = useRouter()
  const [naverConnected, setNaverConnected] = useState<boolean | null>(null)
  const [naverUploadedAt, setNaverUploadedAt] = useState<string | null>(null)
  const [betaStatus, setBetaStatus] = useState<{ userCount: number; maxUsers: number } | null>(null)
  const [betaUsed, setBetaUsed] = useState<number>(0)

  const [form, setForm] = useState<BlogFormData>(INITIAL_FORM)
  const [keywordInput, setKeywordInput] = useState('')
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishStatus, setPublishStatus] = useState<{
    type: 'success' | 'error'; message: string; step?: string; sessionExpired?: boolean
  } | null>(null)
  const [selectedFont, setSelectedFont] = useState('나눔고딕')
  const [mosaicEnabled, setMosaicEnabled] = useState<Set<string>>(new Set())
  const [mosaicUrls, setMosaicUrls] = useState<Record<string, string>>({})
  const [mosaicLoading, setMosaicLoading] = useState<Set<string>>(new Set())

  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackRating, setFeedbackRating] = useState(0)
  const [feedbackSuccess, setFeedbackSuccess] = useState(true)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [feedbackDone, setFeedbackDone] = useState(false)

  const [showErrorReport, setShowErrorReport] = useState(false)
  const [errorReportComment, setErrorReportComment] = useState('')
  const [errorReportSubmitting, setErrorReportSubmitting] = useState(false)
  const [errorReportDone, setErrorReportDone] = useState(false)

  const [showWaitlist, setShowWaitlist] = useState(false)
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false)
  const [waitlistDone, setWaitlistDone] = useState(false)

  const [isGenerated, setIsGenerated] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const editRef = useRef<HTMLDivElement>(null)

  const dragIndexRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const rightColRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((d: { user?: { betaCount?: number } }) => { setBetaUsed(d.user?.betaCount ?? 0) })
      .catch(() => {})
    fetch('/api/naver/status')
      .then(r => r.json())
      .then((d: { connected?: boolean; sessionUploadedAt?: string | null }) => {
        setNaverConnected(!!d.connected)
        setNaverUploadedAt(d.sessionUploadedAt ?? null)
      })
      .catch(() => setNaverConnected(false))
    fetch('/api/beta/status')
      .then(r => r.json())
      .then((d: { userCount: number; maxUsers: number }) => setBetaStatus(d))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (result) rightColRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [result])

  // contenteditable에 초기 내용 주입 (isEditing 진입 시)
  useEffect(() => {
    if (isEditing && editRef.current && result) {
      editRef.current.innerHTML = renderContentWithImages(result.content, result.photos, mosaicUrls, mosaicEnabled)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing])

  const set = <K extends keyof BlogFormData>(key: K, value: BlogFormData[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const addKeyword = () => {
    const t = keywordInput.trim()
    if (t && !form.keywords.includes(t)) set('keywords', [...form.keywords, t])
    setKeywordInput('')
  }
  const removeKeyword = (kw: string) => set('keywords', form.keywords.filter(k => k !== kw))
  const handleKeywordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addKeyword() }
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const newPhotos: PhotoItem[] = files.map(file => ({
      id: `${file.name}-${file.lastModified}-${Math.random()}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    set('photos', [...form.photos, ...newPhotos])
    e.target.value = ''
  }

  const removePhoto = (id: string) => {
    const photo = form.photos.find(p => p.id === id)
    if (photo) URL.revokeObjectURL(photo.previewUrl)
    set('photos', form.photos.filter(p => p.id !== id))
    setMosaicEnabled(prev => { const s = new Set(prev); s.delete(id); return s })
    setMosaicUrls(prev => { const n = { ...prev }; delete n[id]; return n })
    setMosaicLoading(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  const toggleMosaic = async (photo: PhotoItem) => {
    const { id } = photo
    if (mosaicEnabled.has(id)) { setMosaicEnabled(prev => { const s = new Set(prev); s.delete(id); return s }); return }
    if (mosaicUrls[id]) { setMosaicEnabled(prev => new Set([...prev, id])); return }
    setMosaicLoading(prev => new Set([...prev, id]))
    try {
      const fd = new FormData()
      fd.append('image', photo.file)
      const res = await fetch('/api/detect-faces', { method: 'POST', body: fd })
      const { faces } = await res.json() as { faces: Array<{ x: number; y: number; w: number; h: number }> }
      const dataUrl = await applyMosaicToImage(photo.previewUrl, faces ?? [])
      setMosaicUrls(prev => ({ ...prev, [id]: dataUrl }))
      setMosaicEnabled(prev => new Set([...prev, id]))
    } catch {
      const dataUrl = await applyMosaicToImage(photo.previewUrl, []).catch(() => photo.previewUrl)
      setMosaicUrls(prev => ({ ...prev, [id]: dataUrl }))
      setMosaicEnabled(prev => new Set([...prev, id]))
    } finally {
      setMosaicLoading(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const fillTestData = async () => {
    setForm({
      businessName: '홍길동 뷔페',
      businessInfo: '경기도 파주시 소재 패밀리 뷔페. 한식·양식·중식·디저트 코너 운영. 영업시간 11:00~21:30. 즉석 조리 코너(스테이크, 초밥, 우동) 운영. 주차 100대 가능. 미취학 아동 무료.',
      photos: [],
      keywords: ['파주 뷔페', '파주 가족외식', '파주 무한리필'],
      tone: 'friendly',
      seoOptimize: true,
    })
    setKeywordInput('')
    try {
      const testImages = [
        { path: '/test-images/food1.svg', name: 'food1.svg' },
        { path: '/test-images/food2.svg', name: 'food2.svg' },
        { path: '/test-images/food3.svg', name: 'food3.svg' },
      ]
      const photos = await Promise.all(
        testImages.map(async ({ path, name }) => {
          const res = await fetch(path)
          const svgBlob = await res.blob()
          const jpegBlob = await svgBlobToJpeg(svgBlob)
          const file = new File([jpegBlob], name.replace('.svg', '.jpg'), { type: 'image/jpeg' })
          return { id: `${name}-${Date.now()}-${Math.random()}`, file, previewUrl: URL.createObjectURL(svgBlob) }
        }),
      )
      setForm(prev => ({ ...prev, photos }))
    } catch { /* 이미지 없이도 테스트 가능 */ }
  }

  const handleDragStart = (index: number) => { dragIndexRef.current = index }
  const handleDragOver = useCallback((e: React.DragEvent, index: number) => { e.preventDefault(); setDragOverIndex(index) }, [])
  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    const dragIndex = dragIndexRef.current
    if (dragIndex === null || dragIndex === dropIndex) return
    const updated = [...form.photos]
    const [moved] = updated.splice(dragIndex, 1)
    updated.splice(dropIndex, 0, moved)
    set('photos', updated)
    dragIndexRef.current = null
    setDragOverIndex(null)
  }
  const handleDragEnd = () => { dragIndexRef.current = null; setDragOverIndex(null) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setResult(null)
    setPublishStatus(null)
    try {
      const fd = new FormData()
      fd.append('businessName', form.businessName)
      fd.append('businessInfo', form.businessInfo)
      fd.append('keywords', JSON.stringify(form.keywords))
      fd.append('lengthOption', 'medium')
      fd.append('customLength', '')
      fd.append('tone', form.tone)
      fd.append('seoOptimize', String(form.seoOptimize))
      fd.append('mustInclude', '')
      fd.append('mustExclude', '')
      fd.append('title', '')
      form.photos.forEach(p => fd.append('photos', p.file))

      const res = await fetch('/api/generate', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string; betaExceeded?: boolean }
        if (err.betaExceeded) { setShowWaitlist(true); return }
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as { title: string; content: string; successIndices?: number[] }
      const resultPhotos = data.successIndices
        ? data.successIndices.map(i => form.photos[i]).filter(Boolean)
        : form.photos
      setResult({ title: data.title, content: data.content, photos: resultPhotos })
    } catch (err) {
      alert(`글 생성 중 오류가 발생했습니다.\n${err instanceof Error ? err.message : ''}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePublish = async () => {
    if (!result) return
    setIsPublishing(true)
    setPublishStatus(null)
    try {
      const images = await Promise.all(
        result.photos.map(p => {
          if (mosaicEnabled.has(p.id) && mosaicUrls[p.id]) return mosaicUrls[p.id].split(',')[1]
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve((reader.result as string).split(',')[1])
            reader.onerror = reject
            reader.readAsDataURL(p.file)
          })
        }),
      )
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: result.title, content: result.content, images, font: selectedFont, location: '' }),
      })
      const data = await res.json() as { success: boolean; error?: string; lastStep?: string }
      if (data.success) {
        setPublishStatus({ type: 'success', message: '발행 완료! 네이버 블로그에서 확인해보세요.' })
        setShowFeedback(true)
        setFeedbackRating(0)
        setFeedbackComment('')
        setFeedbackDone(false)
      } else {
        const isSessionExpired = data.error?.includes('세션') || data.error?.includes('로그인') || data.lastStep === '세션 로드'
        const message = isSessionExpired
          ? '네이버 세션이 만료됐습니다. 네이버 계정을 다시 연결해주세요.'
          : (data.error ?? '발행 실패')
        setPublishStatus({ type: 'error', message, step: data.lastStep, sessionExpired: isSessionExpired })
        if (isSessionExpired) setNaverConnected(false)
      }
    } catch (err) {
      setPublishStatus({ type: 'error', message: err instanceof Error ? err.message : '알 수 없는 오류' })
    } finally {
      setIsPublishing(false)
    }
  }

  const handleFeedbackSubmit = async () => {
    if (!feedbackRating) return
    setFeedbackSubmitting(true)
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: feedbackRating, publishSuccess: feedbackSuccess, comment: feedbackComment }),
      })
      setFeedbackDone(true)
    } finally { setFeedbackSubmitting(false) }
  }

  const handleWaitlistSubmit = async () => {
    if (!waitlistEmail) return
    setWaitlistSubmitting(true)
    try {
      await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: waitlistEmail }),
      })
      setWaitlistDone(true)
    } finally { setWaitlistSubmitting(false) }
  }

  const handleErrorReport = async () => {
    setErrorReportSubmitting(true)
    try {
      await fetch('/api/feedback/error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errorMessage: publishStatus?.message ?? '', lastStep: publishStatus?.step ?? '', userComment: errorReportComment }),
      })
      setErrorReportDone(true)
    } finally { setErrorReportSubmitting(false) }
  }

  const daysAgo = naverUploadedAt ? Math.floor((Date.now() - new Date(naverUploadedAt).getTime()) / 86400000) : null
  const isStale = daysAgo !== null && daysAgo >= 14

  const BETA_LIMIT = 5
  const remaining = Math.max(0, BETA_LIMIT - betaUsed)

  const inputCls = 'w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-[7px] text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--border-accent)] focus:ring-1 focus:ring-[var(--border-accent)]'

  const optBtn = (active: boolean) =>
    `rounded-[var(--radius)] border py-[7px] text-center text-[12px] cursor-pointer transition select-none ${
      active
        ? 'border-[var(--border-accent)] bg-[var(--bg-accent)] text-[var(--text-accent)]'
        : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:border-[var(--border-accent)] hover:bg-[var(--bg-accent)]'
    }`

  return (
    <>
      {/* ── 피드백 모달 ── */}
      {showFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            {feedbackDone ? (
              <div className="py-4 text-center">
                <p className="mb-2 text-2xl">🙏</p>
                <p className="font-semibold text-gray-800">피드백 감사합니다!</p>
                <button onClick={() => setShowFeedback(false)} className="mt-4 w-full rounded-xl py-2.5 text-sm font-semibold text-white transition" style={{ background: '#4f46e5' }}>닫기</button>
              </div>
            ) : (
              <>
                <h3 className="mb-1 text-base font-bold text-gray-900">블로그 발행이 완료됐어요! 🎉</h3>
                <p className="mb-4 text-xs text-gray-400">피드백을 남겨주시면 서비스 개선에 큰 도움이 됩니다.</p>
                <div className="mb-4">
                  <p className="mb-2 text-sm font-medium text-gray-700">글 품질은 어떠셨나요?</p>
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map(s => (
                      <button key={s} type="button" onClick={() => setFeedbackRating(s)}
                        className={`text-2xl transition ${s <= feedbackRating ? 'text-yellow-400' : 'text-gray-200'} hover:text-yellow-300`}>★</button>
                    ))}
                  </div>
                </div>
                <div className="mb-4">
                  <p className="mb-2 text-sm font-medium text-gray-700">발행은 잘 됐나요?</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setFeedbackSuccess(true)}
                      className={`flex-1 rounded-lg border py-2 text-sm font-medium transition ${feedbackSuccess ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>✅ 잘 됐어요</button>
                    <button type="button" onClick={() => setFeedbackSuccess(false)}
                      className={`flex-1 rounded-lg border py-2 text-sm font-medium transition ${!feedbackSuccess ? 'border-red-400 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>❌ 문제가 있었어요</button>
                  </div>
                </div>
                <div className="mb-4">
                  <p className="mb-1.5 text-sm font-medium text-gray-700">개선했으면 하는 점이 있나요?</p>
                  <textarea rows={3} value={feedbackComment} onChange={e => setFeedbackComment(e.target.value)}
                    placeholder="자유롭게 의견을 남겨주세요 (선택)"
                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400" />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowFeedback(false)}
                    className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-500 transition hover:bg-gray-50">나중에</button>
                  <button type="button" onClick={handleFeedbackSubmit} disabled={!feedbackRating || feedbackSubmitting}
                    className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition disabled:opacity-50" style={{ background: '#4f46e5' }}>
                    {feedbackSubmitting ? '제출 중...' : '피드백 제출'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 오류 신고 모달 ── */}
      {showErrorReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            {errorReportDone ? (
              <div className="py-4 text-center">
                <p className="mb-2 text-2xl">✅</p>
                <p className="font-semibold text-gray-800">신고가 접수됐습니다!</p>
                <p className="mt-1 text-sm text-gray-500">빠르게 확인 후 개선할게요.</p>
                <button onClick={() => setShowErrorReport(false)} className="mt-4 w-full rounded-xl py-2.5 text-sm font-semibold text-white transition" style={{ background: '#4f46e5' }}>닫기</button>
              </div>
            ) : (
              <>
                <h3 className="mb-1 text-base font-bold text-gray-900">오류 신고하기 🚨</h3>
                <p className="mb-4 text-xs text-gray-400">아래 오류 정보가 개발팀에 전달됩니다.</p>
                <div className="mb-3 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-600 ring-1 ring-red-200">
                  {publishStatus?.message}
                  {publishStatus?.step && <span className="ml-1 opacity-70">(단계: {publishStatus.step})</span>}
                </div>
                <div className="mb-4">
                  <p className="mb-1.5 text-sm font-medium text-gray-700">추가 설명 (선택)</p>
                  <textarea rows={3} value={errorReportComment} onChange={e => setErrorReportComment(e.target.value)}
                    placeholder="어떤 상황에서 오류가 발생했는지 알려주세요"
                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400" />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowErrorReport(false)}
                    className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-500 transition hover:bg-gray-50">취소</button>
                  <button type="button" onClick={handleErrorReport} disabled={errorReportSubmitting}
                    className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50">
                    {errorReportSubmitting ? '전송 중...' : '신고 제출'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 대기자 모달 ── */}
      {showWaitlist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl text-center">
            {waitlistDone ? (
              <>
                <p className="mb-2 text-2xl">🎉</p>
                <p className="font-semibold text-gray-800">등록 완료!</p>
                <p className="mt-1 text-sm text-gray-500">정식 출시 시 이메일로 알려드릴게요.</p>
                <button onClick={() => setShowWaitlist(false)} className="mt-4 w-full rounded-xl py-2.5 text-sm font-semibold text-white transition" style={{ background: '#4f46e5' }}>닫기</button>
              </>
            ) : (
              <>
                <p className="mb-3 text-3xl">😢</p>
                <p className="mb-1 font-bold text-gray-900">베타 테스트 횟수를 모두 사용했어요.</p>
                <p className="mb-4 text-sm text-gray-500">정식 출시 시 알림을 받으시겠어요?</p>
                <input type="email" value={waitlistEmail} onChange={e => setWaitlistEmail(e.target.value)}
                  placeholder="이메일 입력"
                  className="mb-3 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400" />
                <button onClick={handleWaitlistSubmit} disabled={!waitlistEmail || waitlistSubmitting}
                  className="mb-2 w-full rounded-xl py-2.5 text-sm font-semibold text-white transition disabled:opacity-50" style={{ background: '#4f46e5' }}>
                  {waitlistSubmitting ? '등록 중...' : '알림 받기'}
                </button>
                <button onClick={() => setShowWaitlist(false)} className="text-xs text-gray-400 hover:text-gray-600 transition">닫기</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 2열 메인 레이아웃 ── */}
      <div className="flex flex-1 flex-col md:flex-row" style={{ background: 'var(--surface-1)' }}>

        {/* ────── LEFT : 입력 폼 ────── */}
        <div className="w-full border-b border-[var(--border)] md:w-1/2 md:border-b-0 md:border-r md:h-[calc(100vh-var(--nav-h))] md:overflow-y-auto"
          style={{ background: 'var(--surface-0)', padding: '20px' }}>

          {/* 베타 바 */}
          <div className="mb-3 flex items-center justify-between rounded-[var(--radius)] border border-[var(--border-warning)] px-[14px] py-2"
            style={{ background: 'var(--bg-warning)' }}>
            <span className="text-[12px]" style={{ color: 'var(--text-warning)' }}>
              베타 테스트 중 — 무료 {BETA_LIMIT}회 이용 가능
              {betaStatus ? ` (${betaStatus.userCount}/${betaStatus.maxUsers}명)` : ''}
            </span>
            <strong className="text-[12px]" style={{ color: 'var(--text-warning)' }}>
              {remaining}/{BETA_LIMIT} 남음
            </strong>
          </div>

          {/* 네이버 연결 상태 */}
          {naverConnected === false && (
            <div className="mb-3 flex items-center justify-between rounded-[var(--radius)] border border-amber-300 bg-amber-50 px-3 py-2">
              <span className="text-[12px] text-amber-700">네이버 세션을 업로드해야 발행할 수 있어요.</span>
              <Link href="/naver-connect" className="shrink-0 rounded px-2.5 py-1 text-[12px] font-semibold text-white transition hover:opacity-90" style={{ background: '#f59e0b' }}>연결하기</Link>
            </div>
          )}
          {naverConnected === true && (
            isStale ? (
              <div className="mb-3 flex items-center justify-between rounded-[var(--radius)] border border-yellow-300 bg-yellow-50 px-3 py-2">
                <span className="text-[12px] text-yellow-700">세션 갱신을 권장해요 ({daysAgo}일 전 업로드)</span>
                <Link href="/naver-connect" className="shrink-0 rounded px-2.5 py-1 text-[12px] font-semibold text-white transition hover:opacity-90" style={{ background: '#eab308' }}>갱신하기</Link>
              </div>
            ) : (
              <div className="mb-3 flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border-success)] px-3 py-2"
                style={{ background: 'var(--bg-success)' }}>
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="flex-1 text-[12px]" style={{ color: 'var(--text-success)' }}>
                  네이버 연결됨{daysAgo !== null ? ` · ${daysAgo === 0 ? '오늘' : `${daysAgo}일 전`} 업로드` : ''}
                </span>
                <Link href="/naver-connect" className="text-[12px] text-emerald-600 hover:underline">관리</Link>
              </div>
            )
          )}

          <form onSubmit={handleSubmit}>
            {/* 테스트 자동입력 */}
            <button type="button" onClick={fillTestData}
              className="mb-3 w-full rounded-[var(--radius)] border border-dashed border-amber-300 bg-amber-50 py-2 text-[12px] font-medium text-amber-700 transition hover:bg-amber-100">
              🧪 테스트 자동입력
            </button>

            <SL>업체 정보</SL>

            <div className="mb-[14px]">
              <label className="mb-[5px] block text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                업체명 <span className="text-red-400">*</span>
              </label>
              <input type="text" required placeholder="예: 홍길동 카페" value={form.businessName}
                onChange={e => set('businessName', e.target.value)} className={inputCls} />
            </div>

            <div className="mb-[14px]">
              <label className="mb-[5px] block text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                업체 소개 <span className="text-red-400">*</span>
              </label>
              <textarea required rows={4} placeholder={'특징, 위치, 영업시간, 메뉴 등 자유롭게 입력하세요.'}
                value={form.businessInfo} onChange={e => set('businessInfo', e.target.value)}
                className={inputCls + ' resize-none'} />
            </div>

            {/* 사진 업로드 */}
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="mb-[14px] flex w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] py-4 text-[12px] transition hover:border-[var(--border-accent)] hover:bg-[var(--bg-accent)]"
              style={{ color: 'var(--text-muted)', background: 'var(--surface-1)' }}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              사진을 드래그하거나 클릭해서 업로드
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />

            {form.photos.length > 0 && (
              <div className="mb-[14px] grid grid-cols-3 gap-2 sm:grid-cols-4">
                {form.photos.map((photo, index) => {
                  const isActive = mosaicEnabled.has(photo.id)
                  const isProcessing = mosaicLoading.has(photo.id)
                  const displaySrc = isActive && mosaicUrls[photo.id] ? mosaicUrls[photo.id] : photo.previewUrl
                  return (
                    <div key={photo.id} className="flex flex-col gap-1">
                      <div draggable onDragStart={() => handleDragStart(index)}
                        onDragOver={e => handleDragOver(e, index)} onDrop={e => handleDrop(e, index)} onDragEnd={handleDragEnd}
                        className={`group relative aspect-square cursor-grab overflow-hidden rounded-[var(--radius)] ${dragOverIndex === index ? 'ring-2 ring-[var(--border-accent)] ring-offset-1 scale-95' : ''}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={displaySrc} alt={`이미지 ${index + 1}`} className="h-full w-full object-cover" />
                        <span className="absolute left-1 top-1 rounded bg-black/50 px-1 text-[10px] font-semibold text-white">{index + 1}</span>
                        <button type="button" onClick={() => removePhoto(photo.id)}
                          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-gray-600 opacity-0 transition hover:text-red-500 group-hover:opacity-100">
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <button type="button" onClick={() => toggleMosaic(photo)} disabled={isProcessing}
                        className={`w-full rounded py-0.5 text-[10px] font-medium transition disabled:opacity-50 ${isActive ? 'bg-[var(--fill-accent)] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {isProcessing ? '분석 중' : isActive ? '모자이크 ON' : '모자이크'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 키워드 */}
            <SL>키워드</SL>
            <div className="mb-[14px] flex flex-wrap gap-[5px]">
              {form.keywords.map(kw => (
                <span key={kw} className="flex items-center gap-1 rounded-full px-[10px] py-[3px] text-[12px]"
                  style={{ background: 'var(--bg-accent)', color: 'var(--text-accent)', border: '0.5px solid var(--border-accent)' }}>
                  {kw}
                  <button type="button" onClick={() => removeKeyword(kw)}
                    className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full opacity-60 hover:opacity-100">
                    <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
              <div className="flex gap-1">
                <input type="text" value={keywordInput} onChange={e => setKeywordInput(e.target.value)}
                  onKeyDown={handleKeywordKeyDown}
                  placeholder="키워드 입력 후 Enter"
                  className="rounded-full border border-dashed border-[var(--border)] bg-transparent px-[10px] py-[3px] text-[12px] outline-none focus:border-[var(--border-accent)]"
                  style={{ color: 'var(--text-muted)' }} />
                <button type="button" onClick={addKeyword}
                  className="rounded-full border border-dashed border-[var(--border)] px-[10px] py-[3px] text-[12px] transition hover:border-[var(--border-accent)] hover:bg-[var(--bg-accent)]"
                  style={{ color: 'var(--text-muted)' }}>+ 추가</button>
              </div>
            </div>

            {/* 글 스타일 */}
            <SL>글 스타일</SL>
            <div className="mb-[14px] grid grid-cols-2 gap-2">
              {([
                { value: 'friendly',     label: '친근함' },
                { value: 'professional', label: '전문적' },
                { value: 'informative',  label: '정보전달' },
              ] as const).map(opt => (
                <button key={opt.value} type="button" onClick={() => set('tone', opt.value)}
                  className={optBtn(form.tone === opt.value)}>
                  {opt.label}
                </button>
              ))}
              <button type="button" onClick={() => set('seoOptimize', !form.seoOptimize)}
                className={optBtn(form.seoOptimize)}>
                SEO 최적화
              </button>
            </div>

            {/* 생성 버튼 */}
            <button type="submit" disabled={isLoading}
              className="flex w-full items-center justify-center gap-[6px] rounded-[var(--radius)] py-[10px] text-[14px] font-medium transition disabled:opacity-60"
              style={{ background: 'var(--fill-accent)', color: 'var(--on-accent)' }}>
              {isLoading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  AI가 작성 중...
                </>
              ) : (
                <>✦ 블로그 글 자동 작성하기</>
              )}
            </button>
          </form>
        </div>

        {/* ────── RIGHT : 미리보기 ────── */}
        <div ref={rightColRef}
          className="w-full md:w-1/2 md:h-[calc(100vh-var(--nav-h))] md:overflow-y-auto"
          style={{ background: 'var(--surface-2)', padding: '20px' }}>

          <SL>생성 결과 미리보기</SL>

          {!result ? (
            <div className="flex h-[60vh] flex-col items-center justify-center text-center md:h-full">
              <div className="mb-3 text-3xl opacity-30">✍️</div>
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>좌측에서 정보를 입력하고</p>
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>글 작성 버튼을 눌러주세요</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {/* 제목 */}
              <h2 className="mb-3 text-[15px] font-medium leading-[1.5]" style={{ color: 'var(--text-primary)' }}>
                {result.title}
              </h2>

              {/* 본문 */}
              <div
                className="mb-3 text-[13px] leading-[1.8]
                  [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-gray-900
                  [&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-gray-800
                  [&_li]:mt-1 [&_p]:mt-2 [&_p]:leading-relaxed
                  [&_strong]:font-semibold [&_strong]:text-gray-900
                  [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5"
                style={{ color: 'var(--text-secondary)' }}
                dangerouslySetInnerHTML={{ __html: renderContentWithImages(result.content, result.photos, mosaicUrls, mosaicEnabled) }}
              />

              {/* 구분선 */}
              <div className="my-3 h-px" style={{ background: 'var(--border)' }} />

              {/* 서체 선택 */}
              <div className="mb-2">
                <label className="mb-[5px] block text-[13px]" style={{ color: 'var(--text-secondary)' }}>서체</label>
                <select value={selectedFont} onChange={e => setSelectedFont(e.target.value)} className={inputCls}>
                  {['나눔고딕', '나눔명조', '나눔바른고딕', '나눔스퀘어', '맑은 고딕', '돋움', '굴림', '바탕', '궁서'].map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              {/* 발행 상태 */}
              {publishStatus && (
                <div className={`mb-2 rounded-[var(--radius)] px-3 py-2 text-[13px] font-medium ${
                  publishStatus.type === 'success' ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : 'bg-red-50 text-red-700 ring-1 ring-red-200'
                }`}>
                  {publishStatus.message}
                  {publishStatus.step && <span className="ml-1.5 text-[11px] opacity-70">(단계: {publishStatus.step})</span>}
                  {publishStatus.sessionExpired && (
                    <a href="/naver-connect" className="ml-2 underline font-semibold hover:opacity-80">네이버 연결하기 →</a>
                  )}
                </div>
              )}

              {/* 액션 버튼 */}
              <div className="flex gap-2 border-t border-[var(--border)] pt-3">
                <button type="button" disabled={isPublishing}
                  onClick={() => {
                    if (publishStatus?.type === 'success') {
                      setResult(null)
                      setPublishStatus(null)
                      setForm(INITIAL_FORM)
                    } else {
                      setResult(null)
                      setPublishStatus(null)
                    }
                  }}
                  className="flex-1 rounded-[var(--radius)] border border-[var(--border)] py-2 text-[13px] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
                  style={{ color: 'var(--text-secondary)' }}>
                  {publishStatus?.type === 'success' ? '새 글 작성' : '수정하기'}
                </button>

                {publishStatus?.type === 'error' && !publishStatus.sessionExpired && (
                  <button type="button"
                    onClick={() => { setShowErrorReport(true); setErrorReportDone(false); setErrorReportComment('') }}
                    className="flex-1 rounded-[var(--radius)] border border-red-200 bg-red-50 py-2 text-[13px] font-medium text-red-600 transition hover:bg-red-100">
                    오류 신고 🚨
                  </button>
                )}

                {publishStatus?.type !== 'success' && (
                  <button type="button" disabled={isPublishing} onClick={handlePublish}
                    className="flex-1 rounded-[var(--radius)] py-2 text-[13px] font-medium transition disabled:opacity-60"
                    style={{ background: 'var(--fill-accent)', color: 'var(--on-accent)' }}>
                    {isPublishing ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        발행 중...
                      </span>
                    ) : '올리기'}
                  </button>
                )}
              </div>

              {isPublishing && (
                <p className="mt-2 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  네이버에 발행 중이에요... 잠시 기다려주세요
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
