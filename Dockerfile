# syntax=docker/dockerfile:1

# ---- 依赖层：web 构建与 verify 共用 ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- 生产构建 ----
FROM deps AS build
COPY . .
RUN npm run build

# ---- 静态站点（nginx，含 /health 健康端点） ----
FROM nginx:1.27-alpine AS web
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=5s --timeout=3s --retries=12 --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1

# ---- 一次性验证服务 ----
FROM deps AS verify
COPY . .
ENV HEALTH_URL=http://web/health
CMD ["sh", "scripts/verify.sh"]
