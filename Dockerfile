FROM node:20-slim

# 한글 폰트 (Playwright --with-deps가 Chromium 시스템 라이브러리를 처리)
RUN apt-get update && apt-get install -y \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# ── 의존성 설치 ──────────────────────────────────────────────────
COPY package*.json ./
RUN npm ci

# Playwright 자체 Chromium + 모든 시스템 의존성 설치
# (시스템 chromium 대신 Playwright가 직접 관리하는 버전을 사용)
RUN npx playwright install chromium --with-deps

# ── 소스 복사 + 빌드 ─────────────────────────────────────────────
COPY . .
ARG NEXT_PUBLIC_TOSS_CLIENT_KEY
ENV NEXT_PUBLIC_TOSS_CLIENT_KEY=$NEXT_PUBLIC_TOSS_CLIENT_KEY
RUN npm run build

# SQLite 볼륨 마운트 경로 생성
RUN mkdir -p /data

# ── 런타임 설정 ──────────────────────────────────────────────────
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=file:/data/dev.db

CMD sh -c "npx prisma migrate deploy || true && npx next start -p ${PORT}"
