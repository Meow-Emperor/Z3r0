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
  - title: Multi-Agent orchestration
    details: A lead Agent coordinates specialist Agents for intelligence gathering, validation, code audit, reverse analysis, and cryptanalysis.
  - title: Project evidence plane
    details: WorkProject turns transient investigation output into persistent records, graph relationships, paths, tasks, and summaries.
  - title: Retrieval context plane
    details: Building knowledge graphs with LightRAG Core provides matching original document chunks and graph context for task-oriented inputs.
  - title: Replayable event timeline
    details: The UI consumes normalized timeline events that can be streamed live or loaded later as history.
  - title: Distributed sandbox resources
    details: Managed Docker hosts, images, and containers allow execution environments to be isolated, scaled, and assigned to projects.
  - title: Preloaded sandbox toolchain
    details: The default sandbox image bundles recon, DNS, web discovery, credential testing, Android, firmware, reverse engineering, browser, Python, and wordlist capabilities behind sandbox-local skills.
  - title: Unified egress layer
    details: Container traffic can be routed through direct, HTTP, HTTPS, or SOCKS5 modes using one platform-managed policy surface.
  - title: Operator workbench
    details: The frontend combines chat, project records, graph review, sandbox selector, terminal, files, and noVNC into one workflow.
---
