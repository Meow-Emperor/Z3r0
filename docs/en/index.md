---
# https://vitepress.dev/reference/default-theme-home-page
layout: home
pageClass: z3r0-docs-home

hero:
  name: Z3r0
  text: Red team workbench
  tagline: AI-native red-team workbench for authorized penetration testing and vulnerability research, with specialist agents, sandboxed tooling, evidence records, and replayable timelines.
  image:
    src: /z3r0-logo.png
    alt: Z3r0 logo
  actions:
    - theme: brand
      text: Quick start
      link: /en/guide/quick-start
    - theme: alt
      text: Documentation
      link: /en/guide/overview

features:
  - title: Multi-agent orchestration
    details: A lead agent coordinates specialist agents for intelligence gathering, validation, code audit, reverse analysis, and cryptanalysis.
  - title: Project evidence plane
    details: Work projects bind graph-targeted work items to authorized assets, work item-attributed evidence, validated findings, continuous attack paths, retest candidates, and lead review decisions.
  - title: Retrieval context plane
    details: Building knowledge graphs with LightRAG Core provides matching original document chunks and graph context for task-oriented inputs.
  - title: Replayable event timeline
    details: The UI consumes normalized timeline events that can be streamed live or loaded later as history.
  - title: Distributed sandbox resources
    details: Managed Docker hosts, images, and containers allow execution environments to be isolated, scaled, and assigned to projects.
  - title: Preloaded sandbox toolchain
    details: The default sandbox image provides targeted DNS, HTTP, and service diagnostics plus local artifact, Android, firmware, reverse engineering, browser, and Python capabilities behind sandbox-local skills.
  - title: Unified egress layer
    details: Container traffic can be routed through direct, HTTP, HTTPS, or SOCKS5 modes using one platform-managed policy surface.
  - title: Operator workbench
    details: The frontend combines chat, workflow state, graph review, evidence chains, attack paths, sandbox selection, terminal, files, and noVNC.
---
