---
# https://vitepress.dev/reference/default-theme-home-page
layout: home
pageClass: z3r0-docs-home

hero:
  name: Z3r0
  text: 红队协作工作台
  tagline: 面向授权渗透测试与漏洞挖掘的多 Agent 协作平台
  image:
    src: /z3r0-logo.png
    alt: Z3r0 logo
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/guide/quick-start
    - theme: alt
      text: 说明文档
      link: /zh/guide/overview

features:
  - title: 多 Agent 编排
    details: 主控 Agent 协调情报搜集、漏洞验证、代码审计、逆向分析和密码分析专家。
  - title: 项目证据平面
    details: WorkProject 将图谱目标 WorkItem 绑定到授权资产、WorkItem 归属证据、已验证发现、连续攻击路径、重测候选和主控复核决策。
  - title: 检索上下文平面
    details: 通过 LightRAG Core 构建知识图谱，为任务型输入提供匹配的原始文档分块与图谱上下文。
  - title: 可回放事件时间线
    details: 前端消费标准化时间线事件，同一模型支持实时流和历史回放。
  - title: 分布式 sandbox 资源
    details: 托管 Docker 主机、镜像和容器使执行环境可以隔离、扩展并绑定到项目。
  - title: 预装 sandbox 工具链
    details: 默认 sandbox 镜像围绕 sandbox 内 skills 提供侦察、DNS、Web 发现、凭据测试、Android、固件、逆向、浏览器、Python 和字典能力。
  - title: 统一出口层
    details: 容器流量可通过直连、HTTP、HTTPS 或 SOCKS5 模式路由，并由平台统一管理策略。
  - title: 操作者工作台
    details: 前端将对话、工作流状态、图谱复核、证据链、攻击路径、sandbox 选择、终端、文件和 noVNC 组织为统一流程。
---
