'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type LengthOption = 'short' | 'medium' | 'long' | 'custom'
type ToneOption = 'friendly' | 'professional' | 'informative'

interface PhotoItem {
  id: string
  file: File
  previewUrl: string
}

interface BlogFormData {
  title: string
  businessName: string
  businessInfo: string
  location: string
  photos: PhotoItem[]
  keywords: string[]
  lengthOption: LengthOption
  customLength: string
  tone: ToneOption
  seoOptimize: boolean
  mustInclude: string
  mustExclude: string
}

interface GenerateResult {
  title: string
  content: string
  photos: PhotoItem[]
}

const INITIAL_FORM: BlogFormData = {
  title: '',
  businessName: '',
  businessInfo: '',
  location: '',
  photos: [],
  keywords: [],
  lengthOption: 'medium',
  customLength: '',
  tone: 'friendly',
  seoOptimize: false,
  mustInclude: '',
  mustExclude: '',
}

function renderContentWithImages(content: string, photos: PhotoItem[], mosaicUrls: Record<string, string>, mosaicEnabled: Set<string>): string {
  let rendered = content
  photos.forEach((photo, i) => {
    const src = mosaicEnabled.has(photo.id) && mosaicUrls[photo.id] ? mosaicUrls[photo.id] : photo.previewUrl
    rendered = rendered.replace(
      new RegExp(`<!--\\s*IMAGE_${i + 1}\\s*-->`, 'gi'),
      `<img src="${src}" alt="사진 ${i + 1}" style="width:100%;border-radius:12px;margin:16px 0;" />`
    )
  })
  return rendered
}

// SVG blob → JPEG blob 변환 (sharp는 SVG 미지원)
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

// 특정 영역 픽셀화
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

// 얼굴 감지 결과(퍼센트 좌표)를 받아 canvas에 모자이크 적용 → data URL 반환
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
          pixelateRegion(ctx,
            (f.x / 100) * canvas.width,
            (f.y / 100) * canvas.height,
            (f.w / 100) * canvas.width,
            (f.h / 100) * canvas.height,
            16,
          )
        }
      } else {
        // 얼굴 미감지 시 전체 블러 처리
        pixelateRegion(ctx, 0, 0, canvas.width, canvas.height, 16)
      }
      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    img.onerror = reject
    img.src = previewUrl
  })
}

export default function BlogFormPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string | null } | null>(null)
  const [naverConnected, setNaverConnected] = useState<boolean | null>(null)
  const [naverUploadedAt, setNaverUploadedAt] = useState<string | null>(null)
  const [form, setForm] = useState<BlogFormData>(INITIAL_FORM)
  const [keywordInput, setKeywordInput] = useState('')
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishStatus, setPublishStatus] = useState<{ type: 'success' | 'error'; message: string; step?: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [selectedFont, setSelectedFont] = useState('나눔고딕')
  const [mosaicEnabled, setMosaicEnabled] = useState<Set<string>>(new Set())
  const [mosaicUrls, setMosaicUrls] = useState<Record<string, string>>({})
  const [mosaicLoading, setMosaicLoading] = useState<Set<string>>(new Set())

  const dragIndexRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d: { user?: { email: string; name: string | null } | null }) => {
        if (d.user) setCurrentUser(d.user)
      })
      .catch(() => {})
    fetch('/api/naver/status')
      .then((r) => r.json())
      .then((d: { connected?: boolean; sessionUploadedAt?: string | null }) => {
        setNaverConnected(!!d.connected)
        setNaverUploadedAt(d.sessionUploadedAt ?? null)
      })
      .catch(() => setNaverConnected(false))
  }, [])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  useEffect(() => {
    if (result) {
      previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [result])

  const set = <K extends keyof BlogFormData>(key: K, value: BlogFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  // 키워드
  const addKeyword = () => {
    const trimmed = keywordInput.trim()
    if (trimmed && !form.keywords.includes(trimmed)) {
      set('keywords', [...form.keywords, trimmed])
    }
    setKeywordInput('')
  }

  const removeKeyword = (kw: string) =>
    set('keywords', form.keywords.filter((k) => k !== kw))

  const handleKeywordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addKeyword()
    }
  }

  // 사진 업로드
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const newPhotos: PhotoItem[] = files.map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random()}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    set('photos', [...form.photos, ...newPhotos])
    e.target.value = ''
  }

  const removePhoto = (id: string) => {
    const photo = form.photos.find((p) => p.id === id)
    if (photo) URL.revokeObjectURL(photo.previewUrl)
    set('photos', form.photos.filter((p) => p.id !== id))
    setMosaicEnabled(prev => { const s = new Set(prev); s.delete(id); return s })
    setMosaicUrls(prev => { const n = { ...prev }; delete n[id]; return n })
    setMosaicLoading(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  const toggleMosaic = async (photo: PhotoItem) => {
    const { id } = photo
    if (mosaicEnabled.has(id)) {
      setMosaicEnabled(prev => { const s = new Set(prev); s.delete(id); return s })
      return
    }
    if (mosaicUrls[id]) {
      setMosaicEnabled(prev => new Set([...prev, id]))
      return
    }
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
      // 실패 시 전체 픽셀화 적용
      const dataUrl = await applyMosaicToImage(photo.previewUrl, []).catch(() => photo.previewUrl)
      setMosaicUrls(prev => ({ ...prev, [id]: dataUrl }))
      setMosaicEnabled(prev => new Set([...prev, id]))
    } finally {
      setMosaicLoading(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const fillTestData = async () => {
    setForm({
      title: '',
      businessName: '홍길동 뷔페',
      businessInfo:
        '경기도 파주시 소재 패밀리 뷔페. 한식·양식·중식·디저트 코너 운영. 영업시간 11:00~21:30. 즉석 조리 코너(스테이크, 초밥, 우동) 운영. 주차 100대 가능. 미취학 아동 무료.',
      location: '',
      photos: [],
      keywords: ['파주 뷔페', '파주 가족외식', '파주 무한리필'],
      lengthOption: 'medium',
      customLength: '',
      tone: 'friendly',
      seoOptimize: true,
      mustInclude: '즉석 조리 코너, 주차 가능, 미취학 아동 무료',
      mustExclude: '가격 할인 이벤트',
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
          // SVG → JPEG 변환 (sharp는 SVG 미지원이므로 클라이언트에서 미리 변환)
          const jpegBlob = await svgBlobToJpeg(svgBlob)
          const jpegName = name.replace('.svg', '.jpg')
          const file = new File([jpegBlob], jpegName, { type: 'image/jpeg' })
          return {
            id: `${name}-${Date.now()}-${Math.random()}`,
            file,
            previewUrl: URL.createObjectURL(svgBlob), // 미리보기는 원본 SVG 사용
          }
        })
      )
      setForm((prev) => ({ ...prev, photos }))
    } catch {
      // 이미지 없이도 테스트 가능
    }
  }

  // 드래그로 순서 변경
  const handleDragStart = (index: number) => {
    dragIndexRef.current = index
  }

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }, [])

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

  const handleDragEnd = () => {
    dragIndexRef.current = null
    setDragOverIndex(null)
  }

  // 제출 → API 호출
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setResult(null)

    try {
      const fd = new FormData()
      fd.append('businessName', form.businessName)
      fd.append('businessInfo', form.businessInfo)
      fd.append('keywords', JSON.stringify(form.keywords))
      fd.append('lengthOption', form.lengthOption)
      fd.append('customLength', form.customLength)
      fd.append('tone', form.tone)
      fd.append('seoOptimize', String(form.seoOptimize))
      fd.append('mustInclude', form.mustInclude)
      fd.append('mustExclude', form.mustExclude)
      fd.append('title', form.title)
      form.photos.forEach((p) => fd.append('photos', p.file))

      const res = await fetch('/api/generate', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as { title: string; content: string; successIndices?: number[] }
      const resultPhotos = data.successIndices
        ? data.successIndices.map((i) => form.photos[i]).filter(Boolean)
        : form.photos
      setResult({ title: data.title, content: data.content, photos: resultPhotos })
    } catch (err) {
      console.error(err)
      alert(`글 생성 중 오류가 발생했습니다.\n${err instanceof Error ? err.message : ''}`)
    } finally {
      setIsLoading(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none ring-offset-1 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200'

  const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-10 px-4">
      <div className="mx-auto max-w-2xl">
        {/* 사용자 표시줄 */}
        {currentUser && (
          <div className="mb-4 flex items-center justify-between rounded-xl bg-white px-4 py-2.5 shadow-sm ring-1 ring-gray-100">
            <span className="text-sm text-gray-600">
              {currentUser.name ? (
                <><span className="font-medium text-gray-900">{currentUser.name}</span> · {currentUser.email}</>
              ) : (
                currentUser.email
              )}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs font-medium text-gray-400 hover:text-red-500 transition"
            >
              로그아웃
            </button>
          </div>
        )}

        {/* 네이버 연결 상태 배너 */}
        {naverConnected === false && (
          <div className="mb-4 flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
            <span className="text-sm text-amber-700">
              네이버 세션을 업로드해야 발행할 수 있어요.
            </span>
            <Link
              href="/naver-connect"
              className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600"
            >
              연결하기
            </Link>
          </div>
        )}
        {naverConnected === true && (() => {
          const daysAgo = naverUploadedAt
            ? Math.floor((Date.now() - new Date(naverUploadedAt).getTime()) / 86400000)
            : null
          const isStale = daysAgo !== null && daysAgo >= 14
          return isStale ? (
            <div className="mb-4 flex items-center justify-between rounded-xl bg-yellow-50 px-4 py-3 ring-1 ring-yellow-200">
              <span className="text-sm text-yellow-700">
                세션 갱신을 권장해요 ({daysAgo}일 전 업로드)
              </span>
              <Link href="/naver-connect" className="shrink-0 rounded-lg bg-yellow-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-yellow-600">
                갱신하기
              </Link>
            </div>
          ) : (
            <div className="mb-4 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
              <span className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                네이버 연결됨{daysAgo !== null && ` (${daysAgo === 0 ? '오늘' : `${daysAgo}일 전`} 업로드)`}
              </span>
              <Link href="/naver-connect" className="text-xs text-emerald-600 hover:underline">
                관리
              </Link>
            </div>
          )
        })()}

        {/* 헤더 */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">블로그 자동 작성</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            업체 정보를 입력하면 AI가 블로그 글을 자동으로 작성해 드립니다.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 테스트 자동입력 */}
          <button
            type="button"
            onClick={fillTestData}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 py-3 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
          >
            🧪 테스트 자동입력
          </button>

          {/* 카드: 기본 정보 */}
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="mb-5 text-base font-semibold text-gray-800">기본 정보</h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>
                  제목 <span className="text-xs font-normal text-gray-400">(선택)</span>
                </label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="블로그 제목을 입력하거나 AI에게 맡기세요"
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                />
              </div>

              <div>
                <label className={labelClass}>
                  업체명 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  className={inputClass}
                  placeholder="예: 홍길동 카페"
                  value={form.businessName}
                  onChange={(e) => set('businessName', e.target.value)}
                />
              </div>

              <div>
                <label className={labelClass}>
                  업체 정보 <span className="text-red-400">*</span>
                </label>
                <textarea
                  required
                  rows={5}
                  className={`${inputClass} resize-none`}
                  placeholder={
                    '특징, 영업시간, 위치, 메뉴 등 자유롭게 입력해 주세요.\n예) 영업시간: 오전 9시 ~ 오후 10시\n위치: 서울시 마포구 합정역 2번 출구 도보 3분\n대표 메뉴: 아메리카노 4,500원'
                  }
                  value={form.businessInfo}
                  onChange={(e) => set('businessInfo', e.target.value)}
                />
              </div>

              <div>
                <label className={labelClass}>
                  업체 위치 <span className="text-xs font-normal text-gray-400">(지도 자동 삽입)</span>
                </label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="예: 서울 마포구 합정역 2번 출구"
                  value={form.location ?? ''}
                  onChange={(e) => set('location', e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* 카드: 사진 업로드 */}
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="mb-1 text-base font-semibold text-gray-800">사진 업로드</h2>
            <p className="mb-4 text-xs text-gray-400">드래그해서 순서를 변경할 수 있습니다.</p>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50 py-5 text-sm font-medium text-indigo-500 transition hover:bg-indigo-100"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              사진 추가
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotoChange}
            />

            {form.photos.length > 0 && (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {form.photos.map((photo, index) => {
                  const isActive = mosaicEnabled.has(photo.id)
                  const isProcessing = mosaicLoading.has(photo.id)
                  const displaySrc = isActive && mosaicUrls[photo.id] ? mosaicUrls[photo.id] : photo.previewUrl
                  return (
                    <div key={photo.id} className="flex flex-col gap-1.5">
                      <div
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={handleDragEnd}
                        className={`group relative aspect-square cursor-grab overflow-hidden rounded-xl transition ${
                          dragOverIndex === index ? 'scale-95 ring-2 ring-indigo-400 ring-offset-1' : ''
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={displaySrc}
                          alt={`업로드 이미지 ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/20" />
                        <span className="absolute left-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 text-xs font-semibold text-white">
                          {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removePhoto(photo.id)}
                          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-gray-600 opacity-0 shadow transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      {/* 모자이크 토글 버튼 */}
                      <button
                        type="button"
                        onClick={() => toggleMosaic(photo)}
                        disabled={isProcessing}
                        className={`w-full rounded-lg py-1 text-xs font-medium transition disabled:opacity-50 ${
                          isActive
                            ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {isProcessing ? (
                          <span className="flex items-center justify-center gap-1">
                            <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            분석 중
                          </span>
                        ) : isActive ? '모자이크 ON' : '모자이크'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* 카드: 글쓰기 옵션 */}
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="mb-5 text-base font-semibold text-gray-800">글쓰기 옵션</h2>
            <div className="space-y-5">
              {/* 키워드 */}
              <div>
                <label className={labelClass}>키워드</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className={`${inputClass} flex-1`}
                    placeholder="키워드 입력 후 Enter 또는 쉼표"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={handleKeywordKeyDown}
                  />
                  <button
                    type="button"
                    onClick={addKeyword}
                    className="shrink-0 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-600"
                  >
                    추가
                  </button>
                </div>
                {form.keywords.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {form.keywords.map((kw) => (
                      <span
                        key={kw}
                        className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700"
                      >
                        {kw}
                        <button
                          type="button"
                          onClick={() => removeKeyword(kw)}
                          className="flex h-4 w-4 items-center justify-center rounded-full text-indigo-400 hover:bg-indigo-200 hover:text-indigo-700"
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2.5}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 글 길이 */}
              <div>
                <label className={labelClass}>원하는 글 길이</label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { value: 'short', label: '짧게', desc: '~500자' },
                      { value: 'medium', label: '보통', desc: '~1000자' },
                      { value: 'long', label: '길게', desc: '~2000자' },
                      { value: 'custom', label: '직접 입력', desc: '' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => set('lengthOption', opt.value)}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                        form.lengthOption === opt.value
                          ? 'border-indigo-500 bg-indigo-500 text-white'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-300'
                      }`}
                    >
                      {opt.label}
                      {opt.desc && (
                        <span
                          className={`ml-1 text-xs ${form.lengthOption === opt.value ? 'text-indigo-100' : 'text-gray-400'}`}
                        >
                          {opt.desc}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {form.lengthOption === 'custom' && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min={100}
                      max={10000}
                      className={`${inputClass} w-36`}
                      placeholder="글자수"
                      value={form.customLength}
                      onChange={(e) => set('customLength', e.target.value)}
                    />
                    <span className="text-sm text-gray-500">자</span>
                  </div>
                )}
              </div>

              {/* 말투 */}
              <div>
                <label className={labelClass}>말투</label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { value: 'friendly', label: '친근함', icon: '😊' },
                      { value: 'professional', label: '전문적', icon: '💼' },
                      { value: 'informative', label: '정보전달형', icon: '📋' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => set('tone', opt.value)}
                      className={`flex flex-col items-center rounded-xl border py-3 text-sm font-medium transition ${
                        form.tone === opt.value
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-200'
                      }`}
                    >
                      <span className="mb-1 text-lg">{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* SEO */}
              <div>
                <label className="flex cursor-pointer items-center gap-3">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={form.seoOptimize}
                      onChange={(e) => set('seoOptimize', e.target.checked)}
                    />
                    <div className="h-5 w-9 rounded-full bg-gray-200 transition peer-checked:bg-indigo-500" />
                    <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
                  </div>
                  <span className="text-sm font-medium text-gray-700">SEO 최적화</span>
                  <span className="text-xs text-gray-400">검색 엔진에 잘 노출되도록 최적화합니다</span>
                </label>
              </div>
            </div>
          </section>

          {/* 카드: 추가 지침 */}
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="mb-5 text-base font-semibold text-gray-800">추가 지침</h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>반드시 포함할 내용</label>
                <textarea
                  rows={3}
                  className={`${inputClass} resize-none`}
                  placeholder="예: 주차 가능 여부, 반려동물 동반 가능, 특별 할인 이벤트 등"
                  value={form.mustInclude}
                  onChange={(e) => set('mustInclude', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>제외할 내용</label>
                <textarea
                  rows={3}
                  className={`${inputClass} resize-none`}
                  placeholder="예: 경쟁 업체 언급 금지, 가격 정보 제외 등"
                  value={form.mustExclude}
                  onChange={(e) => set('mustExclude', e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* 제출 버튼 */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-2xl bg-indigo-500 py-4 text-base font-semibold text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="h-5 w-5 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                AI가 글을 작성하고 있어요...
              </span>
            ) : (
              '블로그 글 자동 작성하기'
            )}
          </button>

          <p className="pb-4 text-center text-xs text-gray-400">
            <span className="text-red-400">*</span> 표시는 필수 입력 항목입니다
          </p>
        </form>

        {/* 미리보기 섹션 */}
        {result && (
          <div ref={previewRef} className="mt-10 space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-sm font-medium text-gray-500">생성 결과 미리보기</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            {/* 미리보기 카드 */}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              {/* 제목 */}
              <h2 className="mb-6 text-xl font-bold text-gray-900">{result.title}</h2>

              {/* 본문 (HTML 렌더링, 마커 위치에 실제 이미지 삽입) */}
              <div
                className="text-sm leading-relaxed text-gray-700
                  [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-gray-900
                  [&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-gray-800
                  [&_li]:mt-1 [&_p]:mt-2 [&_p]:leading-relaxed
                  [&_strong]:font-semibold [&_strong]:text-gray-900
                  [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5"
                dangerouslySetInnerHTML={{
                  __html: renderContentWithImages(result.content, result.photos, mosaicUrls, mosaicEnabled),
                }}
              />
            </section>

            {/* 서체 선택 */}
            <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-gray-100">
              <span className="shrink-0 text-sm font-medium text-gray-700">서체</span>
              <select
                value={selectedFont}
                onChange={(e) => setSelectedFont(e.target.value)}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
              >
                {['나눔고딕', '나눔명조', '나눔바른고딕', '나눔스퀘어', '맑은 고딕', '돋움', '굴림', '바탕', '궁서'].map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            {/* 발행 상태 메시지 */}
            {publishStatus && (
              <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
                publishStatus.type === 'success'
                  ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
                  : 'bg-red-50 text-red-700 ring-1 ring-red-200'
              }`}>
                {publishStatus.message}
                {publishStatus.step && (
                  <span className="ml-2 text-xs opacity-70">(실패 단계: {publishStatus.step})</span>
                )}
              </div>
            )}

            {/* 저장 상태 메시지 */}
            {saveStatus && (
              <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
                saveStatus.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                  : 'bg-red-50 text-red-700 ring-1 ring-red-200'
              }`}>
                {saveStatus.message}
              </div>
            )}

            {/* GitHub에 저장 버튼 */}
            <button
              type="button"
              disabled={isSaving || isPublishing}
              onClick={async () => {
                setIsSaving(true)
                setSaveStatus(null)
                try {
                  const res = await fetch('/api/posts/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      title: result.title,
                      content: result.content,
                      businessName: form.businessName,
                      keywords: form.keywords,
                    }),
                  })
                  const data = await res.json() as { ok?: boolean; filePath?: string; error?: string }
                  if (data.ok) {
                    setSaveStatus({ type: 'success', message: `GitHub에 저장됐습니다. (${data.filePath})` })
                  } else {
                    setSaveStatus({ type: 'error', message: data.error ?? '저장 실패' })
                  }
                } catch (err) {
                  setSaveStatus({ type: 'error', message: err instanceof Error ? err.message : '저장 중 오류' })
                } finally {
                  setIsSaving(false)
                }
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-800 bg-gray-900 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  저장 중...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 3-.4c1.02.01 2.04.14 3 .4 2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58C20.57 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  GitHub에 저장
                </>
              )}
            </button>

            {/* 액션 버튼 */}
            <div className="flex gap-3 pb-10">
              <button
                type="button"
                onClick={() => { setResult(null); setPublishStatus(null); setSaveStatus(null) }}
                disabled={isPublishing}
                className="flex-1 rounded-2xl border border-gray-200 bg-white py-3.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] disabled:opacity-50"
              >
                수정하기
              </button>
              <button
                type="button"
                disabled={isPublishing}
                onClick={async () => {
                  setIsPublishing(true)
                  setPublishStatus(null)
                  try {
                    // 사진 → base64 변환 (모자이크 ON이면 모자이크 버전 사용)
                    const images = await Promise.all(
                      result.photos.map(p => {
                        if (mosaicEnabled.has(p.id) && mosaicUrls[p.id]) {
                          return mosaicUrls[p.id].split(',')[1]
                        }
                        return new Promise<string>((resolve, reject) => {
                          const reader = new FileReader()
                          reader.onload = () => resolve((reader.result as string).split(',')[1])
                          reader.onerror = reject
                          reader.readAsDataURL(p.file)
                        })
                      })
                    )
                    const res = await fetch('/api/publish', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ title: result.title, content: result.content, images, font: selectedFont, location: form.location }),
                    })
                    const data = await res.json() as { success: boolean; url?: string; error?: string; lastStep?: string }
                    if (data.success) {
                      setPublishStatus({ type: 'success', message: '발행 완료! 네이버 블로그에서 확인해보세요.' })
                    } else {
                      const isSessionExpired =
                        data.error?.includes('세션') ||
                        data.error?.includes('로그인') ||
                        data.lastStep === '세션 로드'
                      const message = isSessionExpired
                        ? '세션이 만료됐습니다. naver-session.json을 다시 업로드해주세요.'
                        : (data.error ?? '발행 실패')
                      setPublishStatus({ type: 'error', message, step: data.lastStep })
                      if (isSessionExpired) setNaverConnected(false)
                    }
                  } catch (err) {
                    setPublishStatus({ type: 'error', message: err instanceof Error ? err.message : '알 수 없는 오류' })
                  } finally {
                    setIsPublishing(false)
                  }
                }}
                className="flex-1 rounded-2xl bg-indigo-500 py-3.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPublishing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    발행 중...
                  </span>
                ) : '올리기'}
              </button>
            </div>
            {isPublishing && (
              <p className="pb-6 text-center text-xs text-gray-400">
                네이버에 발행 중이에요... 잠시 기다려주세요
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
