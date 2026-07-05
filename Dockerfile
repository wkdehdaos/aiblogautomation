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

# ── 소스 복사 + Prisma 생성 + 빌드 ──────────────────────────────
COPY . .

RUN npx prisma generate
RUN npm run build

# standalone 출력에 정적 파일 병합 (Next.js standalone 필수 단계)
RUN cp -r .next/static .next/standalone/.next/static \
    && cp -r public   .next/standalone/public

# ── 런타임 설정 ──────────────────────────────────────────────────
ENV NODE_ENV=production
EXPOSE 3000

# DB 마이그레이션 적용 후 서버 시작
CMD ["sh", "-c", "npx prisma migrate deploy && node .next/standalone/server.js"]
