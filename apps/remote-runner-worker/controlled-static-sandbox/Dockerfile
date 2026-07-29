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
COPY apps/remote-runner-worker/scripts/controlledStaticRootlessPackageImport.mjs /tmp/prodivix-seed/controlledStaticRootlessPackageImport.mjs
COPY apps/remote-runner-worker/controlled-static-sandbox/create-package-seed.mjs /tmp/prodivix-seed/create-package-seed.mjs

RUN set -eu; \
    cd /tmp/prodivix-toolchains/react-vite; \
    pnpm fetch \
      --frozen-lockfile \
      --ignore-scripts \
      --store-dir=/opt/prodivix/pnpm-store; \
    cd /tmp/prodivix-toolchains/vue-vite; \
    pnpm fetch \
      --frozen-lockfile \
      --ignore-scripts \
      --store-dir=/opt/prodivix/pnpm-store; \
    mkdir -p /opt/prodivix/package-seeds; \
    for preset in react-vite vue-vite; do \
      rm -rf /workspace; \
      mkdir -p /workspace; \
      cp "/tmp/prodivix-toolchains/${preset}/package.json" /workspace/package.json; \
      cp "/tmp/prodivix-toolchains/${preset}/pnpm-lock.yaml" /workspace/pnpm-lock.yaml; \
      cp "/tmp/prodivix-toolchains/${preset}/pnpm-workspace.yaml" /workspace/pnpm-workspace.yaml; \
      pnpm --dir=/workspace install \
        --frozen-lockfile \
        --offline \
        --ignore-scripts \
        --reporter=append-only \
        --loglevel=error \
        --frozen-store \
        --no-verify-store-integrity \
        --store-dir=/opt/prodivix/pnpm-store \
        --package-import-method=hardlink; \
      node /tmp/prodivix-seed/create-package-seed.mjs "${preset}"; \
    done; \
    rm -rf /workspace /root/.cache /root/.npm /tmp/prodivix-toolchains /tmp/prodivix-seed; \
    mkdir /workspace; \
    chmod -R a+rX /opt/prodivix/pnpm-store /opt/prodivix/package-seeds

COPY apps/remote-runner-worker/sandbox/entry.mjs /opt/prodivix/sandbox-entry.mjs

ENV HOME=/tmp
WORKDIR /workspace
USER 65532:65532
ENTRYPOINT ["node", "/opt/prodivix/sandbox-entry.mjs"]
