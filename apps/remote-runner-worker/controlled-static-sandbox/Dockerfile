ARG NODE_IMAGE
FROM ${NODE_IMAGE}

ARG PNPM_VERSION=11.9.0
ARG NODE_VERSION=22.23.1

RUN test "$(node --version)" = "v${NODE_VERSION}" \
    && npm install --global --ignore-scripts "pnpm@${PNPM_VERSION}" \
    && test "$(pnpm --version)" = "${PNPM_VERSION}"

COPY packages/verification-adapters/scripts/toolchains/react-vite/package.json /tmp/prodivix-toolchains/react-vite/package.json
COPY packages/verification-adapters/scripts/toolchains/react-vite/pnpm-lock.yaml /tmp/prodivix-toolchains/react-vite/pnpm-lock.yaml
COPY packages/verification-adapters/scripts/toolchains/react-vite/pnpm-workspace.yaml /tmp/prodivix-toolchains/react-vite/pnpm-workspace.yaml
COPY packages/verification-adapters/scripts/toolchains/vue-vite/package.json /tmp/prodivix-toolchains/vue-vite/package.json
COPY packages/verification-adapters/scripts/toolchains/vue-vite/pnpm-lock.yaml /tmp/prodivix-toolchains/vue-vite/pnpm-lock.yaml
COPY packages/verification-adapters/scripts/toolchains/vue-vite/pnpm-workspace.yaml /tmp/prodivix-toolchains/vue-vite/pnpm-workspace.yaml

RUN cd /tmp/prodivix-toolchains/react-vite \
    && pnpm fetch \
      --frozen-lockfile \
      --ignore-scripts \
      --store-dir=/opt/prodivix/pnpm-store \
    && cd /tmp/prodivix-toolchains/vue-vite \
    && pnpm fetch \
      --frozen-lockfile \
      --ignore-scripts \
      --store-dir=/opt/prodivix/pnpm-store \
    && rm -rf /root/.cache /root/.npm /tmp/prodivix-toolchains \
    && chmod -R a+rX /opt/prodivix/pnpm-store

COPY apps/remote-runner-worker/sandbox/entry.mjs /opt/prodivix/sandbox-entry.mjs

ENV HOME=/tmp
WORKDIR /workspace
USER 65532:65532
ENTRYPOINT ["node", "/opt/prodivix/sandbox-entry.mjs"]
