# Cloud Run용 Next.js standalone 컨테이너.
# 로컬/Vercel 빌드에는 영향 없음(BUILD_TARGET=cloudrun일 때만 standalone).
FROM node:24-slim AS deps
WORKDIR /app
# prisma·sharp 네이티브 빌드에 필요한 최소 패키지
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# postinstall(prisma generate)이 스키마를 필요로 하므로 npm ci 전에 복사한다.
COPY prisma ./prisma
RUN npm ci

FROM node:24-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV BUILD_TARGET=cloudrun
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

FROM node:24-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run은 $PORT(기본 8080)로 트래픽을 보낸다.
ENV PORT=8080
# standalone 산출물 + 정적 자산 + prisma 스키마/엔진
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 8080
CMD ["node", "server.js"]
