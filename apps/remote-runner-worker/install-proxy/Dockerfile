ARG NODE_IMAGE
FROM ${NODE_IMAGE}

COPY apps/remote-runner-worker/install-proxy/entry.mjs /opt/prodivix/install-proxy.mjs

ENV HOME=/tmp
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["node", "/opt/prodivix/install-proxy.mjs"]
