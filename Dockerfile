FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=6767
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=6767

COPY --from=build /app/.output ./.output

EXPOSE 6767

CMD ["node", ".output/server/index.mjs"]
