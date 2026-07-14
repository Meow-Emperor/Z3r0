---
title: 首次使用
editLink: true
---

# 首次使用

本文介绍 Z3r0 的主要模块，并通过授权 CTF 项目说明执行资源配置与项目工作流。

## 系统概览

通过已配置的监听地址和端口访问 Z3r0，首先进入落地页：

![landing-1](/images/landing-1.png)

点击 `Open workbench` 进入登录页：

![login-1](/images/login-1.png)

输入已配置的管理员账号和密码，认证成功后进入管理控制台。

系统包含以下核心模块：

1. Playground：提供基于会话的 Agent 团队交互与协作。
2. Work Projects：管理项目范围、负责人、会话、证据记录、关系图和攻击路径。
3. Knowledges：管理文档接入、向量查看、语义检索与知识图谱探索。
4. Host Management：管理主机节点，并编排 sandbox 容器的实际运行环境。
5. Egress Proxies：统一出口管理模块，配置 HTTP/HTTPS/SOCKS5 proxy，用于 sandbox 容器的 egress。
6. Sandbox Images：管理针对不同需求定制的 sandbox 镜像，包括带有 sandbox 内 skills 和预装安全工具链的默认镜像。
7. Sandbox Containers：编排实际运行的 sandbox 容器，承载命令执行、文件、noVNC/浏览器复核和 egress 配置。
8. System Users：系统用户管理模块，可配置用户信息、角色等。
9. System Config：管理 Agent 运行时、Agent model，以及独立的 LightRAG embedding 与关系抽取配置。

## 开始工作

以下内容从系统初始状态开始配置执行资源、创建项目，并运行授权 CTF 工作流。

### 知识文档

Knowledges 将评估手册、研究笔记、报告及其他参考资料整理为可检索的知识集合。上传一份或多份 Markdown、PDF 文档后，可持续查看解析与索引状态，掌握资料接入进度。

Documents 视图用于查看资料来源、处理状态、内容摘要、解析后原文与解析信息；Vectors 视图呈现检索所使用的原始文档分块及来源元数据；Knowledge Graph 视图支持实体与关系的语义检索，并可沿关联关系渐进探索。各视图共同提供透明、可复核的知识管理体验，使检索结果能够追溯到具体来源。

索引完成后，系统保留文档内容、向量与图谱关系所构成的知识表示，无需持续保存上传源文件。删除文档时，对应的索引内容与图谱贡献会同步从知识集合中移除。

系统通过 LightRAG Core 构建知识图谱，为任务型输入提供匹配的原始文档分块与图谱上下文。检索会跟随当前请求与会话焦点，使后续任务能够持续引用相关资料，并在任务推进过程中保持内容依据的一致性。

### 连接主机

系统启动时会将本机加入 `Host Management`，因此远程主机不是必需项。当部署需要工作负载隔离、权限分离、独立资源容量或集中运维时，建议使用专用远程主机运行 sandbox 容器。

按照以下说明，配置并连接远程主机。

**1. 安装 Docker 并配置 Remote API 和双向证书认证**

```bash
curl -fsSL https://get.docker.com | bash -s docker
wget https://raw.githubusercontent.com/yv1ing/Z3r0/refs/heads/main/sandbox/init_host.sh && chmod +x init_host.sh
```

使用 `bash ./init_host.sh` 执行脚本，输入主机 IP 地址，等待证书生成和自动配置，Docker 客户端证书将会被输出到当前目录下：

![init-host-1](/images/init-host-1.png)

部分发行版下，可能需要手动修改 Docker service，避免 daemon 配置冲突：

```bash
systemctl edit docker.service
```

空白处写入以下内容：

```text
[Service]
ExecStart=
ExecStart=/usr/bin/dockerd
```

![init-host-2](/images/init-host-2.png)

重启 Docker service：

```bash
systemctl restart docker
```

**2. 创建主机记录并填写连接信息**

在 `Host Management` 中点击 `Create Host`，填写远程主机的 IP 地址、端口、账号、密码和 Docker 证书信息，然后保存主机记录。

> Docker Remote API 流量离开本机时应使用双向 TLS。Plain 模式仅适用于具备独立访问控制、明确可信且隔离的网络环境。

![create-host-1](/images/create-host-1.png)

**3. 连接主机并构建 sandbox 镜像**

系统提供在线终端，可通过 SSH 连接远程主机。按照 [快速开始](./quick-start#构建-sandbox) 中的说明构建 sandbox 镜像。

![create-host-2](/images/create-host-2.png)

### 创建镜像

在 `Sandbox Images` 中创建镜像记录，镜像名称应与实际构建结果保持一致：

![create-image-1](/images/create-image-1.png)

### 创建容器

在 `Sandbox Containers` 模块中新建容器，并选择对应的远程主机和 sandbox 镜像。创建容器时可指定 egress 模式，支持 Direct、HTTP、HTTPS、SOCKS5 和 Tor；HTTP、HTTPS 和 SOCKS5 需要预先在 `Egress Proxies` 中配置。

![create-container-1](/images/create-container-1.png)

### 测试容器

sandbox 容器创建完成后，可通过列表项右侧的操作按钮启动容器，并使用网页终端、文件管理器和 noVNC 接入。

![create-container-2](/images/create-container-2.png)

### 创建项目

以授权 CTF 赛题为目标，在 `Work Projects` 中新建 WorkProject，填写名称、类型、描述和负责人，并绑定 sandbox 容器与已知资产：

![create-project-1](/images/create-project-1.png)

### 任务实施

WorkProject 创建完成后会出现在 `Playground` 列表中。进入项目并创建会话后，可向 Agent 团队下达授权 CTF 任务目标，最终交付经过验证的 flag 与可复核的 write-up：

![project-example-1](/images/project-example-1.png)

任务执行过程中，可通过 `Project records` 查看进度与结构化证据。资产、漏洞发现、关系和图谱数据共同保存评估过程中形成的有效结果：

![project-example-2](/images/project-example-2.png)

![project-example-3](/images/project-example-3.png)
