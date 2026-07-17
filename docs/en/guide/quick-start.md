---
title: Quick Start
editLink: true
---

# Quick Start

This guide covers the required configuration, sandbox image build, and deployment steps for production and development environments.

> :warning: Iteration Notice
>
> Z3r0 is under active development. Review release notes before upgrading, pin production deployments to a tested revision, and back up configuration and PostgreSQL data before applying changes.

## Before You Start

### Basic Configuration

Z3r0 requires the following configuration and infrastructure:

| Item | Description |
| --- | --- |
| `.z3r0/config.json` | System runtime configuration |
| `.z3r0/agents/*` | Agent role and instruction files |
| `.lightrag/` | Temporary parser inputs and local LightRAG working files |
| `sandbox` | Isolated execution environment |
| Docker | Runtime for sandbox containers |
| PostgreSQL | Persistent application and LightRAG storage with pgvector and Apache AGE extensions |

Get the latest code from GitHub:

```bash
git clone https://github.com/yv1ing/Z3r0.git && cd Z3r0
```

### Build the Sandbox

Build the sandbox image used for isolated task execution:

> :warning: Supported Architecture
>
> The sandbox image build currently supports only the x64/amd64 architecture. arm64/Apple Silicon, including Apple Silicon Macs, is not supported. Run this step on an x64 host or in an x64 build environment.

```bash
cd sandbox && bash build.sh
```

The build produces `penetration-runtime:latest`. Add a matching image record in `Sandbox Images` before creating a container.

## Production Environment

Complete the following steps for a production deployment.

### Prepare Configuration

```bash
cp .z3r0/config.json.example .z3r0/config.json
```

Edit the system runtime configuration in `.z3r0/config.json`, mainly updating the following items:

| Item | Description |
| --- | --- |
| `system.encrypt_key` | System data encryption key. This must be changed. A random string of at least 32 bytes is recommended. |
| `system.bootstrap_admin` | Default system administrator information. This must be changed. A strong password is recommended. |
| `database` | System database connection information. The bundled production Compose deployment uses host networking, so `host` remains `127.0.0.1`. |
| `agents.*` | LLM API configuration for each Agent. Providers and models can be configured separately by role. |
| `lightrag.embedding_*` | OpenAI-compatible embedding API, key, model, and vector dimension. |
| `lightrag.llm_*` | Independent OpenAI-compatible LLM API, key, and model used for entity and relationship extraction. |
| `lightrag.graph_matches` | Number of entity and relationship matches included in graph retrieval context. |
| `lightrag.chunk_matches` | Number of original document chunks included in text retrieval context. |

LightRAG uses `lightrag.llm_*` for entity and relationship extraction. These settings are configured independently from each Agent model in `agents.*`. Both bundled Compose files pull `ghcr.io/yv1ing/postgres-for-rag:latest` and `ghcr.io/yv1ing/pgadmin4:latest` from GitHub Container Registry. The PostgreSQL image includes the pgvector and Apache AGE extensions required by LightRAG storage.

The embedding API, model, and dimension define the knowledge collection's vector representation and should be selected before the first document import. Moving an existing collection to a different embedding model or dimension requires removing its indexed documents and importing them again. Embedding credentials, extraction LLM settings, and graph and document retrieval breadth can otherwise be managed independently through `System Config`.

### Start Containers

Once everything is ready, start Z3r0 with one command:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Reverse Proxy (Optional)

By default, the service listens on `0.0.0.0:8000`. You can configure it to listen on `127.0.0.1:8000` as needed and set up a reverse proxy.

An example Nginx configuration is shown below:

```text
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 10000 ssl default_server;

    ssl_certificate     /etc/nginx/ssl/vps.crt;
    ssl_certificate_key /etc/nginx/ssl/vps.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    auth_basic "Origin Restricted";
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://127.0.0.1:8000;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }
}
```

## Development Environment

Use the following setup for local development.

### Configure the Environment

- Python version: 3.13.5
- Node.js version: 24.18.0

Create a virtual environment with the following commands:

```bash
python -m venv .venv

# Windows:
.venv\Scripts\Activate.ps1

# Linux:
source .venv/bin/activate
```

Install system dependencies:

```bash
pip install -r requirements.txt
```

```bash
cd web && npm ci
```

Build the frontend project:

```bash
cd web && npm run build
```

### Start PostgreSQL

Start the development database services:

```bash
docker compose -f docker-compose.dev.yml up -d
```

The Compose service creates the `z3r0` database automatically. PostgreSQL is available on `127.0.0.1:5432`. pgAdmin is available as an optional administration interface at `http://127.0.0.1:5433` using the credentials defined in `docker-compose.dev.yml`.

### Start the Project

Create `.z3r0/config.json` and fill in the relevant information based on the example in `.z3r0/config.json.example`.

Start the project with the following command:

```bash
python main.py
```

By default, the service listens on `0.0.0.0:8000`. Visit `http://127.0.0.1:8000/` to access it.

## Next Step

Continue with [First Use](./first-use) to configure execution resources and create a project.
