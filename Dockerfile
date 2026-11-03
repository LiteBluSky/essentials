# Build on Linux so the bundle gets the Linux SQLite (libsql) binary, then
# ship only the built server and its migrations. Data lives in /data (mount a
# volume there); nothing personal is ever baked into the image.

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Build-time: the name shown in the header and browser tab.
ARG VITE_APP_NAME=Essentials
ENV VITE_APP_NAME=$VITE_APP_NAME
RUN pnpm build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8008 \
    DATABASE_PATH=/data/essentials.db
COPY --from=build /app/.output ./.output
COPY --from=build /app/drizzle ./drizzle
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8008
CMD ["node", ".output/server/index.mjs"]
