FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.1.0 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Stub the submodule-linked devDep so pnpm install succeeds without submodules
RUN mkdir -p submodules/bruno/packages/bruno-lang \
 && echo '{"name":"@usebruno/lang","version":"0.0.0"}' > submodules/bruno/packages/bruno-lang/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY src/ src/
COPY types/ types/
COPY tsconfig.json tsdown.config.ts ./
RUN pnpm exec tsdown

FROM base AS runner
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN mkdir -p submodules/bruno/packages/bruno-lang \
 && echo '{"name":"@usebruno/lang","version":"0.0.0"}' > submodules/bruno/packages/bruno-lang/package.json
RUN pnpm install --frozen-lockfile --prod --ignore-scripts
COPY --from=build /app/dist/ dist/
COPY specs/ specs/
EXPOSE 23300
CMD ["node", "dist/cli.mjs", "mcp-http", "--port", "23300"]
