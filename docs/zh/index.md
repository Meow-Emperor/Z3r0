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
  - title: 多 Agent 协同
    details: 将情报侦察、漏洞验证、代码分析和攻击路径梳理等任务分派给专家 Agent 并行推进，提升授权测试的执行效率和覆盖范围。
  - title: 项目化架构
    details: 以 WorkProject 统一管理测试范围、任务、会话、资产、漏洞发现和攻击路径，让红队工作过程可组织、可追踪、可复盘。
  - title: 异步任务运行时
    details: 长命令和 subagent 任务可在后台执行，完成后自动恢复对应会话，减少等待并保持任务状态连续。
  - title: 分布式 sandbox 资源池
    details: 支持多主机、多 Docker 容器、项目级环境绑定和预装安全工具链，测试环境按项目隔离、扩展和切换。
  - title: 受控出站与身份隔离
    details: 通过 egress proxy、sandbox 边界和独立执行环境降低操作者环境暴露风险，适用于授权渗透测试场景。
  - title: 结构化证据沉淀
    details: 持续记录资产、漏洞发现、关系图和攻击路径，使验证质量、复盘效率和交付材料更稳定。
  - title: 知识管理与检索
    details: 通过 LightRAG Core 接入 Markdown/PDF 知识文档，查看文档、向量与图谱数据，并为任务型输入提供相关上下文。
---
