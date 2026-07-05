FROM node:20-slim

# ── Playwright Chromium + 한글 폰트 시스템 패키지 ────────────────
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Playwright가 직접 다운로드하지 않고 시스템 Chromium을 사용
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# ── 의존성 설치 ──────────────────────────────────────────────────
COPY package*.json ./
RUN npm ci

# ── 소스 복사 + 빌드 ─────────────────────────────────────────────
COPY . .
RUN npm run build

# SQLite 볼륨 마운트 경로 생성
RUN mkdir -p /data

# ── 런타임 설정 ──────────────────────────────────────────────────
ENV NODE_ENV=production
ENV PORT=3000
# Railway Variables에 DATABASE_URL이 없을 때 기본값 (.env는 gitignore됨)
ENV DATABASE_URL=file:/data/dev.db

# 컨테이너 시작 시 마이그레이션 적용 후 서버 실행
# || true: 마이그레이션 실패해도 서버는 무조건 시작
CMD sh -c "npx prisma migrate deploy || true && npx next start -p ${PORT}"
