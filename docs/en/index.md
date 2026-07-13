---
# https://vitepress.dev/reference/default-theme-home-page
layout: home
pageClass: z3r0-docs-home

hero:
  name: Z3r0
  text: Red Team Workbench
  tagline: A multi-Agent collaboration platform for authorized penetration testing and vulnerability discovery
  image:
    src: /z3r0-logo.png
    alt: Z3r0 logo
  actions:
    - theme: brand
      text: Quick Start
      link: /en/guide/quick-start
    - theme: alt
      text: Documentation
      link: /en/guide/overview

features:
  - title: Multi-Agent collaboration
    details: Distribute intelligence gathering, vulnerability validation, code analysis, and attack-path mapping across specialist Agents to improve the efficiency and coverage of authorized testing.
  - title: Project-oriented architecture
    details: Use WorkProject to manage test scope, tasks, sessions, assets, vulnerability findings, and attack paths, keeping red team operations organized, traceable, and reviewable.
  - title: Asynchronous task runtime
    details: Run long commands and subagent tasks in the background, then resume context automatically when they finish to reduce waiting and preserve task state.
  - title: Distributed sandbox resource pool
    details: Support multiple hosts, Docker containers, project-bound environments, and a preloaded security toolchain so test infrastructure can be isolated, scaled, and switched by project.
  - title: Controlled egress and identity isolation
    details: Reduce exposure of the operator environment through proxy egress, sandbox boundaries, and independent execution environments, making the platform better suited to authorized penetration-testing scenarios.
  - title: Structured evidence retention
    details: Continuously record assets, vulnerability findings, graph relationships, and attack paths to make validation quality, review efficiency, and deliverables more stable.
  - title: Knowledge administration and retrieval
    details: Ingest Markdown/PDF collections with LightRAG Core, inspect document, vector, and graph data, and supply relevant context for task-oriented inputs.
---
