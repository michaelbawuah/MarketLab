FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY native ./native
COPY scripts/build-native.mjs ./scripts/build-native.mjs
RUN node scripts/build-native.mjs && pnpm prune --prod --ignore-scripts

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production RESEARCH_HOST=0.0.0.0 RESEARCH_PORT=8788 RESEARCH_ENGINE=cpp-verify
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/native/build ./native/build
COPY package.json ./
COPY lib/finance ./lib/finance
COPY lib/research-signing.ts ./lib/research-signing.ts
COPY services/research ./services/research
USER node
EXPOSE 8788
CMD ["node", "--experimental-strip-types", "services/research/server.ts"]
