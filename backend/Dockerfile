FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json backend/package.json
RUN pnpm install --filter @twcc-s3/backend --frozen-lockfile
COPY backend backend
RUN pnpm --filter @twcc-s3/backend build

FROM node:24-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json backend/package.json
RUN pnpm install --filter @twcc-s3/backend --prod --frozen-lockfile
COPY --from=build /repo/backend/dist backend/dist
WORKDIR /repo/backend
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
