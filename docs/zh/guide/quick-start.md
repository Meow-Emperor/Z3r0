---
title: 快速开始
editLink: true
---

# 快速开始

本文说明 Z3r0 在生产环境和开发环境中的必要配置、sandbox 镜像构建与部署流程。

> :warning: 迭代说明
> 
> Z3r0 仍在持续迭代。升级前请查阅版本说明；生产部署应固定到已验证的代码版本，并在变更前备份配置与 PostgreSQL 数据。

## 开始之前

### 基础配置

Z3r0 需要以下配置与基础设施：

| 项目 | 说明 |
| --- | --- |
| `.z3r0/config.json` | 系统的运行时配置 |
| `.z3r0/agents/*` | Agent 角色与指令文件 |
| `.lightrag/` | LightRAG 临时解析输入与本地工作文件 |
| `sandbox` | 隔离执行环境 |
| Docker | sandbox 容器运行时 |
| PostgreSQL | 应用与 LightRAG 持久化存储，需同时包含 pgvector 和 Apache AGE 扩展 |

通过 GitHub 获取最新代码：

```bash
git clone https://github.com/yv1ing/Z3r0.git && cd Z3r0
```

### 构建 sandbox

构建用于隔离任务执行的 sandbox 镜像：

> :warning: 支持的架构
>
> sandbox 镜像构建目前仅支持 x64/amd64 架构，不支持 arm64/Apple Silicon（包括 Apple Silicon Mac）。请在 x64 主机或 x64 构建环境中执行该步骤。

```bash
cd sandbox && bash build.sh
```

构建完成后将生成 `sandbox-runtime:latest`。创建容器前，需要在 `Sandbox Images` 中添加名称一致的镜像记录。

## 生产环境

生产环境部署需要完成以下步骤。

### 准备配置

```bash
cp .z3r0/config.json.example .z3r0/config.json
```

编辑 `.z3r0/config.json` 中的系统运行时配置，主要修改以下内容：

| 项目 | 说明 |
| --- | --- |
| `system.encrypt_key` | 系统数据加密密钥，必须修改，建议使用至少 32 字节的随机字符串。 |
| `system.bootstrap_admin` | 系统默认管理员信息，必须修改，建议使用强密码。 |
| `database` | 系统数据库连接信息。项目提供的生产 Compose 使用 host 网络，因此 `host` 保持为 `127.0.0.1`。 |
| `agents.*` | 各 Agent 的 LLM API 配置，可按角色分别配置供应商和模型。 |
| `lightrag.embedding_*` | OpenAI 兼容的 embedding API、key、model 和向量维度。 |
| `lightrag.llm_*` | 用于实体与关系抽取的独立 OpenAI 兼容 LLM API、key 和 model。 |
| `lightrag.graph_matches` | 图谱检索上下文包含的实体与关系匹配数量。 |
| `lightrag.chunk_matches` | 文本检索上下文包含的原始文档分块数量。 |

LightRAG 使用 `lightrag.llm_*` 完成实体与关系抽取，该配置与 `agents.*` 中的 Agent model 独立。项目提供的两份 Compose 文件均从 GitHub Container Registry 拉取 `ghcr.io/yv1ing/postgres-for-rag:latest` 和 `ghcr.io/yv1ing/pgadmin4:latest`；PostgreSQL 镜像包含 LightRAG 存储所需的 pgvector 与 Apache AGE 扩展。

Embedding API、model 和维度共同定义知识集合的向量表示方式，应在首次导入文档前完成选择。已有知识集合如需更换 embedding model 或维度，需要先移除已索引文档，再重新导入。Embedding 凭据、关系抽取 LLM 配置，以及图谱与文档检索范围可通过 `System Config` 分别管理。

### 启动容器

一切准备就绪后，使用以下命令一键启动 Z3r0：

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 反向代理（可选）

服务默认监听在 `0.0.0.0:8000` 上，可根据需要设置监听在 `127.0.0.1:8000`，并配置反向代理。

可参考的 Nginx 配置如下：

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

## 开发环境

本地开发可使用以下配置。

### 配置环境

- Python 版本：3.13.5
- Node.js 版本：24.18.0

使用以下命令创建虚拟环境：

```bash
python -m venv .venv

# Windows:
.venv\Scripts\Activate.ps1

# Linux:
source .venv/bin/activate
```

安装系统依赖：

```bash
pip install -r requirements.txt
```

```bash
cd web && npm ci
```

构建前端项目：

```bash
cd web && npm run build
```

### 启动 PostgreSQL

启动开发数据库服务：

```bash
docker compose -f docker-compose.dev.yml up -d
```

Compose 服务会自动创建 `z3r0` 数据库。PostgreSQL 地址为 `127.0.0.1:5432`。如需使用管理界面，可通过 `http://127.0.0.1:5433` 访问 pgAdmin，并使用 `docker-compose.dev.yml` 中定义的凭据登录。

### 启动项目

创建 `.z3r0/config.json`，根据 `.z3r0/config.json.example` 中的示例填写相关信息。

使用以下命令启动项目：

```bash
python main.py
```

服务默认监听在 `0.0.0.0:8000` 上，使用 `http://127.0.0.1:8000/` 即可访问。

## 下一步

继续阅读 [首次使用](./first-use)，配置执行资源并创建项目。
