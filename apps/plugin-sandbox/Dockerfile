FROM node:22-alpine AS builder

WORKDIR /workspace

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/plugin-sandbox ./apps/plugin-sandbox

RUN pnpm install --frozen-lockfile --filter @prodivix/plugin-sandbox...
RUN pnpm --filter @prodivix/plugin-sandbox test

FROM nginx:1.27-alpine

COPY --from=builder /workspace/apps/plugin-sandbox/dist /usr/share/nginx/html
COPY --from=builder /workspace/apps/plugin-sandbox/dist/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
