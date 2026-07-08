# syntax=docker/dockerfile:1.7

ARG DEBIAN_RELEASE=trixie

# Browser/runtime pins.
ARG AGENT_BROWSER_VERSION=0.3.5
ARG CHROME_FOR_TESTING_VERSION=145.0.7632.117
ARG UV_VERSION=0.11.28

# Reverse/mobile tooling pins.
ARG GHIDRA_VERSION=12.1
ARG GHIDRA_BUILD=20260513
ARG JADX_VERSION=1.5.5
ARG PWNDBG_VERSION=2026.02.18

# Recon/fingerprinting tooling pins.
ARG OBSERVER_WARD_VERSION=2026.4.8
ARG HTTPX_VERSION=1.9.0
ARG SUBFINDER_VERSION=2.14.0
ARG DNSX_VERSION=1.2.3
ARG AMASS_VERSION=5.1.1
ARG SECLISTS_REF=master

# Build the small HTTP/WebSocket proxy used by the sandbox runtime.
FROM golang:1.26-${DEBIAN_RELEASE} AS proxy-builder

ENV CGO_ENABLED=0

WORKDIR /src/proxy
COPY proxy/ ./
RUN go build -trimpath -ldflags='-s -w' -o /sandbox-proxy .

FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv-bin

FROM debian:${DEBIAN_RELEASE}-slim AS chrome-for-testing-builder

ARG DEBIAN_FRONTEND=noninteractive
ARG CHROME_FOR_TESTING_VERSION

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl unzip; \
    chrome_zip="/tmp/chrome-linux64.zip"; \
    curl -fsSL "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_FOR_TESTING_VERSION}/linux64/chrome-linux64.zip" -o "$chrome_zip"; \
    mkdir -p /opt/chrome-for-testing; \
    unzip -q "$chrome_zip" -d /opt/chrome-for-testing; \
    test -x /opt/chrome-for-testing/chrome-linux64/chrome; \
    if [ -d /opt/chrome-for-testing/chrome-linux64/locales ]; then \
      find /opt/chrome-for-testing/chrome-linux64/locales -type f ! \( \
        -name 'en-US.pak' -o \
        -name 'zh-CN.pak' -o \
        -name 'zh-TW.pak' \
      \) -delete; \
    fi; \
    rm -rf "$chrome_zip" /tmp/* /var/tmp/* /var/lib/apt/lists/* /var/cache/apt/*

# Download and normalize agent-browser assets.
FROM debian:${DEBIAN_RELEASE}-slim AS agent-browser-builder

ARG DEBIAN_FRONTEND=noninteractive
ARG AGENT_BROWSER_VERSION

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends binutils ca-certificates curl tar unzip; \
    mkdir -p \
      /opt/agent-browser/bin \
      /opt/agent-browser/chrome-extension \
      /tmp/agent-browser-cli \
      /tmp/agent-browser-extensions; \
    curl -fsSL "https://github.com/sleepinginsummer/agent-browser-cli/releases/download/v${AGENT_BROWSER_VERSION}/chrome-extensions.zip" -o /tmp/chrome-extensions.zip; \
    unzip -q /tmp/chrome-extensions.zip -d /tmp/agent-browser-extensions; \
    extension_dir="$(find /tmp/agent-browser-extensions -type f -name manifest.json -printf '%h\n' | sort | head -n 1)"; \
    test -n "$extension_dir"; \
    echo "agent-browser extension dir: $extension_dir"; \
    cp -a "$extension_dir"/. /opt/agent-browser/chrome-extension; \
    test -f /opt/agent-browser/chrome-extension/manifest.json; \
    curl -fsSL "https://github.com/sleepinginsummer/agent-browser-cli/releases/download/v${AGENT_BROWSER_VERSION}/sleepinsummer-agent-browser-cli-linux-x64-${AGENT_BROWSER_VERSION}.tgz" -o /tmp/agent-browser-cli.tgz; \
    tar -xzf /tmp/agent-browser-cli.tgz -C /tmp/agent-browser-cli; \
    cp /tmp/agent-browser-cli/package/bin/agent-browser-cli /opt/agent-browser/bin/agent-browser-cli; \
    chmod 755 /opt/agent-browser/bin/agent-browser-cli; \
    strip --strip-unneeded /opt/agent-browser/bin/agent-browser-cli 2>/dev/null || true; \
    /opt/agent-browser/bin/agent-browser-cli --help >/dev/null; \
    find /opt/agent-browser/chrome-extension -type f \( \
      -name '*.md' -o \
      -name '*.map' \
    \) -delete; \
    rm -rf /tmp/* /var/tmp/* /var/lib/apt/lists/* /var/cache/apt/*

# Download and trim Ghidra separately so final image layers do not retain
# build-only tools or archive caches.
FROM debian:${DEBIAN_RELEASE}-slim AS ghidra-builder

ARG DEBIAN_FRONTEND=noninteractive
ARG GHIDRA_VERSION
ARG GHIDRA_BUILD
ARG GHIDRA_URL=https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_${GHIDRA_VERSION}_build/ghidra_${GHIDRA_VERSION}_PUBLIC_${GHIDRA_BUILD}.zip

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends binutils ca-certificates curl unzip; \
    curl -fsSL "$GHIDRA_URL" -o /tmp/ghidra.zip; \
    unzip -q /tmp/ghidra.zip -d /opt; \
    mv "/opt/ghidra_${GHIDRA_VERSION}_PUBLIC" /opt/ghidra; \
    find /opt/ghidra -type d \( \
      -name '.git' -o \
      -name '__pycache__' -o \
      -name 'docs' -o \
      -name 'GPL' \
    \) -prune -exec rm -rf '{}' +; \
    find /opt/ghidra -type f \( \
      -name '*.md' -o \
      -name '*.pdb' -o \
      -name '*.src.zip' \
    \) -delete; \
    find /opt/ghidra -type f -name '*.so' -exec strip --strip-unneeded '{}' +; \
    rm -rf /tmp/* /var/tmp/* /var/lib/apt/lists/* /var/cache/apt/*

# Download and trim jadx separately for the same reason.
FROM debian:${DEBIAN_RELEASE}-slim AS jadx-builder

ARG DEBIAN_FRONTEND=noninteractive
ARG JADX_VERSION
ARG JADX_URL=https://github.com/skylot/jadx/releases/download/v${JADX_VERSION}/jadx-${JADX_VERSION}.zip

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl unzip; \
    mkdir -p /opt/jadx; \
    curl -fsSL "$JADX_URL" -o /tmp/jadx.zip; \
    unzip -q /tmp/jadx.zip -d /opt/jadx; \
    find /opt/jadx -type d \( \
      -name '.github' -o \
      -name 'docs' -o \
      -name 'samples' \
    \) -prune -exec rm -rf '{}' +; \
    find /opt/jadx -type f \( \
      -name '*.bat' -o \
      -name '*.md' -o \
      -name '*.map' \
    \) -delete; \
    chmod 755 /opt/jadx/bin/jadx; \
    rm -rf /tmp/* /var/tmp/* /var/lib/apt/lists/* /var/cache/apt/*

# Validate skills in a build-only stage so lint helpers are not copied into
# the final sandbox image.
FROM debian:${DEBIAN_RELEASE}-slim AS skills-validator

WORKDIR /tmp

COPY .agents .agents
RUN set -eux; \
    chmod 755 .agents/validate-skills.sh; \
    .agents/validate-skills.sh .agents/skills

# Final sandbox runtime image.
FROM debian:${DEBIAN_RELEASE}-slim

ENV HOME=/root \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    TERM=xterm \
    DISPLAY=:0 \
    JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 \
    GHIDRA_HOME=/opt/ghidra \
    JADX_HOME=/opt/jadx \
    UV_TOOL_DIR=/opt/uv/tools \
    UV_TOOL_BIN_DIR=/usr/local/bin \
    UV_PYTHON_DOWNLOADS=never \
    CHROME_BIN=/usr/local/bin/google-chrome \
    PATH=/opt/jadx/bin:/opt/ghidra:/opt/ghidra/support:/usr/lib/jvm/java-21-openjdk-amd64/bin:$PATH

WORKDIR /root

ARG DEBIAN_FRONTEND=noninteractive
ARG CHROME_FOR_TESTING_VERSION
ARG OBSERVER_WARD_VERSION
ARG HTTPX_VERSION
ARG SUBFINDER_VERSION
ARG DNSX_VERSION
ARG AMASS_VERSION
ARG PWNDBG_VERSION
ARG SECLISTS_REF

# Install Debian packages used by the runtime and bundled tools.
RUN set -eux; \
    printf '%s\n' \
      'path-exclude=/usr/share/doc/*' \
      'path-exclude=/usr/share/man/*' \
      'path-exclude=/usr/share/info/*' \
      'path-exclude=/usr/share/lintian/*' \
      'path-exclude=/usr/share/locale/*' \
      'path-include=/usr/share/locale/locale.alias' \
      > /etc/dpkg/dpkg.cfg.d/01_nodoc; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      7zip \
      apktool \
      bash \
      binutils \
      binwalk \
      ca-certificates \
      curl \
      dnsutils \
      ffuf \
      file \
      fonts-droid-fallback \
      g++ \
      gcc \
      gdb \
      git \
      gobuster \
      hydra \
      jq \
      libasound2t64 \
      libatk-bridge2.0-0t64 \
      libatk1.0-0t64 \
      libatspi2.0-0t64 \
      libc6-dev \
      libcups2t64 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libglib2.0-0t64 \
      libgtk-3-0t64 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libx11-6 \
      libxcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
      libxrender1 \
      libxshmfence1 \
      libxss1 \
      libxtst6 \
      ltrace \
      make \
      netcat-openbsd \
      nmap \
      nodejs \
      novnc \
      openssl \
      openjdk-21-jdk \
      npm \
      pkg-config \
      python3 \
      ripgrep \
      strace \
      supervisor \
      tar \
      tor \
      util-linux \
      unzip \
      websockify \
      wget \
      whois \
      x11vnc \
      xvfb; \
    observer_ward_deb="/tmp/observer-ward.deb"; \
    curl -fsSL "https://github.com/emo-crab/observer_ward/releases/download/v${OBSERVER_WARD_VERSION}/observer-ward_v${OBSERVER_WARD_VERSION}_x86_64-unknown-linux-musl.deb" -o "$observer_ward_deb"; \
    apt-get install -y --no-install-recommends "$observer_ward_deb"; \
    rm -f "$observer_ward_deb"; \
    observer_ward -u; \
    ln -sf vnc.html /usr/share/novnc/index.html; \
    mkdir -p /data; \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/* /var/log/apt/* /tmp/* /var/tmp/*

# Install fixed release archives, plus the SecLists snapshot used by discovery
# and credential-audit tools.
RUN set -eux; \
    httpx_zip="/tmp/httpx.zip"; \
    curl -fsSL "https://github.com/projectdiscovery/httpx/releases/download/v${HTTPX_VERSION}/httpx_${HTTPX_VERSION}_linux_amd64.zip" -o "$httpx_zip"; \
    unzip -q "$httpx_zip" -d /tmp/httpx; \
    install -m 755 /tmp/httpx/httpx /usr/local/bin/httpx; \
    rm -rf "$httpx_zip" /tmp/httpx; \
    subfinder_zip="/tmp/subfinder.zip"; \
    curl -fsSL "https://github.com/projectdiscovery/subfinder/releases/download/v${SUBFINDER_VERSION}/subfinder_${SUBFINDER_VERSION}_linux_amd64.zip" -o "$subfinder_zip"; \
    unzip -q "$subfinder_zip" -d /tmp/subfinder; \
    install -m 755 /tmp/subfinder/subfinder /usr/local/bin/subfinder; \
    rm -rf "$subfinder_zip" /tmp/subfinder; \
    dnsx_zip="/tmp/dnsx.zip"; \
    curl -fsSL "https://github.com/projectdiscovery/dnsx/releases/download/v${DNSX_VERSION}/dnsx_${DNSX_VERSION}_linux_amd64.zip" -o "$dnsx_zip"; \
    unzip -q "$dnsx_zip" -d /tmp/dnsx; \
    install -m 755 /tmp/dnsx/dnsx /usr/local/bin/dnsx; \
    rm -rf "$dnsx_zip" /tmp/dnsx; \
    amass_tgz="/tmp/amass.tar.gz"; \
    curl -fsSL "https://github.com/owasp-amass/amass/releases/download/v${AMASS_VERSION}/amass_linux_amd64.tar.gz" -o "$amass_tgz"; \
    mkdir -p /tmp/amass; \
    tar -xzf "$amass_tgz" -C /tmp/amass; \
    install -m 755 /tmp/amass/amass_linux_amd64/amass /usr/local/bin/amass; \
    rm -rf "$amass_tgz" /tmp/amass; \
    seclists_tgz="/tmp/seclists.tar.gz"; \
    curl -fsSL "https://github.com/danielmiessler/SecLists/archive/${SECLISTS_REF}.tar.gz" -o "$seclists_tgz"; \
    mkdir -p /opt/seclists; \
    tar -xzf "$seclists_tgz" -C /opt/seclists --strip-components=1; \
    ln -sfn /opt/seclists /usr/share/seclists; \
    rm -f "$seclists_tgz"; \
    find /opt/seclists -maxdepth 2 -type d \( \
      -name '.github' -o \
      -name '.git' \
    \) -prune -exec rm -rf '{}' +; \
    find /opt/seclists -maxdepth 2 -type f \( \
      -name '.gitattributes' -o \
      -name '.gitignore' -o \
      -name '*.md' \
    \) -delete; \
    strip --strip-unneeded \
      /usr/local/bin/httpx \
      /usr/local/bin/subfinder \
      /usr/local/bin/dnsx \
      /usr/local/bin/amass \
      "$(command -v observer_ward)" \
      2>/dev/null || true; \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/* /var/log/apt/* /tmp/* /var/tmp/*

COPY --from=uv-bin /uv /usr/local/bin/uv
COPY --from=uv-bin /uvx /usr/local/bin/uvx
COPY --from=chrome-for-testing-builder /opt/chrome-for-testing /opt/chrome-for-testing
COPY --from=agent-browser-builder /opt/agent-browser /opt/agent-browser
COPY --from=ghidra-builder /opt/ghidra /opt/ghidra
COPY --from=jadx-builder /opt/jadx /opt/jadx

# Expose bundled tools and preinstall Python CLIs with uv. Pwndbg is installed
# as a system-GDB integration rather than the portable debugger bundle.
RUN set -eux; \
    ln -sf /opt/ghidra/ghidraRun /usr/local/bin/ghidra; \
    ln -sf /opt/ghidra/support/analyzeHeadless /usr/local/bin/analyzeHeadless; \
    ln -sf /opt/jadx/bin/jadx /usr/local/bin/jadx; \
    ln -sf /opt/chrome-for-testing/chrome-linux64/chrome /usr/local/bin/google-chrome; \
    ln -sf /opt/chrome-for-testing/chrome-linux64/chrome /usr/local/bin/chrome; \
    ln -sf /opt/agent-browser/bin/agent-browser-cli /usr/local/bin/agent-browser-cli; \
    uv tool install --python /usr/bin/python3 --no-python-downloads sqlmap; \
    uv tool install --python /usr/bin/python3 --no-python-downloads pwntools; \
    pwndbg_python="$(gdb -nx --batch -iex 'py import sysconfig; print(sysconfig.get_config_var("VERSION"))')"; \
    system_python="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"; \
    test "$pwndbg_python" = "$system_python"; \
    uv tool install --python /usr/bin/python3 --no-python-downloads "git+https://github.com/pwndbg/pwndbg@${PWNDBG_VERSION}"; \
    pwndbg_bin="$(readlink -f "$(command -v pwndbg)")"; \
    pwndbg_tool_python="$(dirname "$pwndbg_bin")/python"; \
    test -x "$pwndbg_tool_python"; \
    pwndbg_gdbinit="$("$pwndbg_tool_python" -c 'import pathlib, sysconfig; print((pathlib.Path(sysconfig.get_paths()["data"]) / "share" / "pwndbg" / "gdbinit.py").resolve())')"; \
    test -f "$pwndbg_gdbinit"; \
    printf 'source %s\n' "$pwndbg_gdbinit" > /root/.gdbinit; \
    uv cache clean; \
    find /opt/uv/tools -type d -name __pycache__ -prune -exec rm -rf '{}' +; \
    find /opt/uv/tools -type f \( -name '*.pyc' -o -name '*.pyo' \) -delete; \
    rm -rf /root/.cache /tmp/* /var/tmp/*

RUN set -eux; \
    7z i >/dev/null; \
    amass -version; \
    apktool --version; \
    bash --version; \
    binwalk --help >/dev/null; \
    checksec --help >/dev/null; \
    pwn checksec --help >/dev/null; \
    dig -v; \
    command -v nslookup; \
    dnsx -version; \
    file --version; \
    ffuf -V; \
    g++ --version; \
    gcc --version; \
    gdb --version; \
    git --version; \
    gobuster version; \
    command -v hydra; \
    hydra -h 2>&1 | grep -qi hydra; \
    httpx -version; \
    java -version; \
    jadx --version; \
    jq --version; \
    nmap --version; \
    node --version; \
    npm --version; \
    observer_ward --help >/dev/null; \
    openssl version; \
    pkg-config --version; \
    pwn --help >/dev/null; \
    pwn_bin="$(readlink -f "$(command -v pwn)")"; \
    pwn_tool_python="$(dirname "$pwn_bin")/python"; \
    test -x "$pwn_tool_python"; \
    "$pwn_tool_python" -c 'from pwn import context; print(context.arch)' >/dev/null; \
    command -v pwndbg; \
    gdb -batch -ex 'python import pwndbg'; \
    python3 --version; \
    readelf --version; \
    command -v nc; \
    sha256sum --version; \
    strace -V; \
    ltrace -V; \
    subfinder -version; \
    sqlmap --version; \
    supervisord --version; \
    test -d /opt/seclists; \
    test -e /usr/share/seclists; \
    tar --version; \
    tor --version; \
    unzip -v >/dev/null; \
    uv --version; \
    uvx --version; \
    rg --version; \
    whois --version; \
    x11vnc -version; \
    google-chrome --version | grep -F "$CHROME_FOR_TESTING_VERSION"; \
    agent-browser-cli --help >/dev/null; \
    command -v websockify; \
    test -x /opt/chrome-for-testing/chrome-linux64/chrome; \
    test -f /opt/agent-browser/chrome-extension/manifest.json; \
    test -x /opt/agent-browser/bin/agent-browser-cli; \
    test -x /opt/ghidra/ghidraRun; \
    test -x /opt/ghidra/support/analyzeHeadless; \
    test -x /opt/jadx/bin/jadx; \
    rm -rf /root/.cache /root/.config/subfinder /tmp/* /var/tmp/*; \
    find /opt/uv/tools -type d -name __pycache__ -prune -exec rm -rf '{}' +; \
    find /opt/uv/tools -type f \( -name '*.pyc' -o -name '*.pyo' \) -delete

COPY --from=proxy-builder --chmod=755 /sandbox-proxy /usr/local/bin/sandbox-proxy
COPY --from=skills-validator /tmp/.agents/skills .agents/skills
COPY --chmod=755 entrypoint.sh /entrypoint.sh
COPY supervisord.conf /supervisord.conf

EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
