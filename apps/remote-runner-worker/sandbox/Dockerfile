ARG NODE_IMAGE
FROM ${NODE_IMAGE}

RUN apt-get update \
    && apt-get install --yes --no-install-recommends util-linux \
    && rm -rf /var/lib/apt/lists/*

COPY apps/remote-runner-worker/sandbox/entry.mjs /opt/prodivix/sandbox-entry.mjs
COPY apps/remote-runner-worker/sandbox/terminal-entry.sh /opt/prodivix/terminal-entry.sh
RUN chmod 0555 /opt/prodivix/terminal-entry.sh

ENV HOME=/tmp
WORKDIR /workspace
USER 65532:65532
ENTRYPOINT ["node", "/opt/prodivix/sandbox-entry.mjs"]
