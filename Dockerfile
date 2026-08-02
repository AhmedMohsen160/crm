# ═══════════════════════════════════════════════════════════════
#  صورة تشغيل نظام CRM — تعمل على أي سيرفر يدعم Docker
#  (Railway / Render / Fly.io / DigitalOcean / سيرفر خاص)
# ═══════════════════════════════════════════════════════════════

# ── 1) تثبيت المكتبات ──────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app

# OpenSSL مطلوب لـ Prisma
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# متصفح الاختبار غير مطلوب على السيرفر — نمنع تنزيله (يوفّر ~150 ميجابايت)
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci

# ── 2) البناء ──────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# نوع قاعدة البيانات يُثبَّت وقت البناء (postgresql على السيرفر)
ARG DATABASE_PROVIDER=postgresql
ENV DATABASE_PROVIDER=$DATABASE_PROVIDER

# قيمة مؤقتة أثناء البناء فقط — القيمة الحقيقية تأتي من إعدادات السيرفر
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV AUTH_SECRET="build-time-placeholder-not-used-at-runtime"
ENV NEXT_TELEMETRY_DISABLED=1
ENV BUILD_STANDALONE=1

RUN npm run build

# ── 3) التشغيل ─────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# ملفات التشغيل المستقلة
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# نحتاج Prisma وقت التشغيل لتهيئة قاعدة البيانات وإنشاء حساب المدير
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin ./node_modules/.bin
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
