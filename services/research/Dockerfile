FROM node:24.19.0-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY native ./native
COPY scripts/build-native.mjs ./scripts/build-native.mjs
RUN node scripts/build-native.mjs && pnpm prune --prod --ignore-scripts

FROM node:24.19.0-bookworm-slim
WORKDIR /app
ARG SOURCE_COMMIT=unknown
ENV NODE_ENV=production RESEARCH_HOST=0.0.0.0 RESEARCH_ENGINE=cpp-verify RESEARCH_BUILD_REVISION=$SOURCE_COMMIT
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/native/build ./native/build
COPY package.json ./
COPY lib/finance ./lib/finance
COPY lib/research-signing.ts ./lib/research-signing.ts
COPY services/research ./services/research
COPY scripts/staging ./scripts/staging
COPY tests/fixtures/research.ts ./tests/fixtures/research.ts
USER node
EXPOSE 8788
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 CMD node -e "fetch('http://127.0.0.1:'+(process.env.RESEARCH_PORT||process.env.PORT||8788)+'/healthz',{signal:AbortSignal.timeout(3000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--experimental-strip-types", "services/research/server.ts"]
