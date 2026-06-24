# ---- Imagem única de produção: API (Express) + front (estático) ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY packages/shared/package.json packages/shared/
COPY packages/mobile/package.json packages/mobile/
RUN npm install --workspaces --include-workspace-root
# Build info: carimba versão + commit git na imagem (vindo do CI via build-args).
# ENV persiste pros RUN abaixo — os scripts npm rodam o gerador automaticamente.
ARG BUILD_VERSION=
ARG BUILD_VERSION_CODE=
ARG BUILD_GIT_SHA=
ARG BUILD_GIT_SHORT_SHA=
ARG BUILD_GIT_BRANCH=
ARG BUILD_TIME_ISO=
ENV BUILD_VERSION=$BUILD_VERSION \
    BUILD_VERSION_CODE=$BUILD_VERSION_CODE \
    BUILD_GIT_SHA=$BUILD_GIT_SHA \
    BUILD_GIT_SHORT_SHA=$BUILD_GIT_SHORT_SHA \
    BUILD_GIT_BRANCH=$BUILD_GIT_BRANCH \
    BUILD_TIME_ISO=$BUILD_TIME_ISO
COPY . .
# gera build-info.ts/json (server + web) a partir dos ARGs/git/gradle (lê versionName do build.gradle)
RUN node scripts/generate-build-info.mjs
# gera o client Prisma ANTES do tsc (senão faltam os tipos @prisma/client no build)
RUN cd packages/server && npx prisma generate
# build do servidor (tsc)
RUN npm run build --workspace packages/server
# typecheck do front (PEGA imports faltando como o Button antes de empacotar)
RUN npm run typecheck --workspace packages/web
# build do front em modo produção, no sub-caminho /minhasaude (API em /minhasaude/api)
ARG VITE_BASE=/minhasaude/
ARG VITE_API_URL=/minhasaude/api
ARG VITE_TELEMEDICINE_URL=
RUN VITE_BASE=$VITE_BASE VITE_API_URL=$VITE_API_URL VITE_TELEMEDICINE_URL=$VITE_TELEMEDICINE_URL npm run build --workspace packages/web

# ---- runtime enxuto ----
FROM node:20-bookworm-slim AS app
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates poppler-utils tesseract-ocr tesseract-ocr-por && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY package*.json ./
COPY packages/server/package.json packages/server/
COPY packages/shared/package.json packages/shared/
RUN npm install --omit=dev --workspaces --include-workspace-root
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/prisma ./packages/server/prisma
COPY --from=builder /app/packages/server/node_modules/.prisma ./packages/server/node_modules/.prisma
COPY --from=builder /app/packages/web/dist ./packages/web/dist
EXPOSE 4001
# migra + sobe (tsc com rootDir '.' gera dist/src/index.js)
CMD ["sh", "-c", "cd packages/server && npx prisma migrate deploy && node dist/src/index.js"]
