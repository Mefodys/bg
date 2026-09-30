FROM ubuntu:24.04
ARG NODE_VERSION=24.9.0
ARG KOTLIN_VERSION=2.4.20
ARG CODEX_VERSION=0.159.2
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git bash tar unzip xz-utils jq python3 openjdk-21-jdk-headless \
    clang make libc6-dev && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
    && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o /tmp/node-shasums \
    && cd /tmp && grep " node-v${NODE_VERSION}-linux-x64.tar.xz$" node-shasums | sed 's@node-v[^ ]*-linux-x64.tar.xz@node.tar.xz@' | sha256sum -c - \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1
RUN curl -fsSL "https://github.com/JetBrains/kotlin/releases/download/v${KOTLIN_VERSION}/kotlin-native-prebuilt-linux-x86_64-${KOTLIN_VERSION}.tar.gz" -o /tmp/konan.tar.gz \
    && curl -fsSL "https://github.com/JetBrains/kotlin/releases/download/v${KOTLIN_VERSION}/kotlin-native-prebuilt-linux-x86_64-${KOTLIN_VERSION}.tar.gz.sha256" -o /tmp/konan.sha256 \
    && checksum="$(tr -d '[:space:]' < /tmp/konan.sha256)" \
    && echo "$checksum  /tmp/konan.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/konan.tar.gz -C /opt
ENV KONANC=/opt/kotlin-native-prebuilt-linux-x86_64-2.4.20/bin/konanc
ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
RUN npm install -g "@openai/codex@${CODEX_VERSION}"
WORKDIR /opt/browser-tools
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npx playwright install chromium --only-shell --with-deps
# Ubuntu has a default UID 1000 user; allocate a dedicated non-root identity.
RUN useradd --uid 1001 --create-home --shell /bin/bash agent \
    && mkdir -p /workspace/repo /results /home/agent/.konan /home/agent/.npm /home/agent/.codex \
    && cp -a /root/.npm/. /home/agent/.npm/ \
    && cp -a /root/.cache/ms-playwright /opt/ms-playwright \
    && chown -R agent:agent /workspace /results /home/agent /opt/ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
COPY sandbox/entrypoint.py /opt/entrypoint.py
COPY sandbox/prewarm.kt /opt/prewarm.kt
USER agent
RUN "$KONANC" /opt/prewarm.kt -o /tmp/prewarm && /tmp/prewarm.kexe
WORKDIR /workspace/repo
ENTRYPOINT ["python3", "/opt/entrypoint.py"]
