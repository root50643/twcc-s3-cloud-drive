FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY frontend/package.json frontend/package.json
RUN pnpm install --filter @twcc-s3/frontend --frozen-lockfile
COPY frontend frontend
RUN pnpm --filter @twcc-s3/frontend build

FROM nginx:1.27-alpine AS runtime
COPY frontend/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/frontend/dist /usr/share/nginx/html
EXPOSE 80
