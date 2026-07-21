# Changelog

All notable changes to Z3r0 are documented in this file.

## [0.2.2] - 2026-07-21

### Added

- Added LightRAG-backed knowledge management with Markdown and PDF ingestion, document processing, vector and graph exploration, and contextual retrieval for Agent tasks.
- Added graph-driven WorkProject orchestration with target-scoped WorkItems, immutable Evidence, coverage tracking, lead review and retesting, and richer asset, Finding, Attack Path, and Activity records.
- Added downloadable Markdown report exports for Agent sessions with configurable retention and automatic cleanup.
- Expanded the default sandbox with reconnaissance, DNS, web discovery, credential testing, binary analysis, debugging, Python, browser automation, and wordlist tooling backed by dedicated skills.

### Changed

- Reworked runtime lifecycle, conversation persistence, context budgeting, API contracts, and frontend workflows for more consistent recovery, replay, and long-running task execution.
- Consolidated backend layer roots into domain packages and centralized OpenAPI and frontend contract generation in the schema export script.
- Refined the operator workbench with reusable resource components, responsive WorkProject layouts, improved session and transcript views, and updated product documentation.
- Updated sandbox permissions and project binding, renamed the default sandbox image to `penetration-runtime:latest`, tightened configuration validation, and moved PostgreSQL deployments to the vector-enabled image and data mount layout required by LightRAG.

### Fixed

- Fixed knowledge graph tag retrieval and related graph exploration behavior.
- Fixed local managed-host Docker connections by falling back to the Unix socket for loopback addresses.
- Fixed Mermaid guidance and rendering fallback behavior, playground nested-list spacing, and container window render loops.
- Fixed WorkProject sandbox selection rendering and the PostgreSQL data directory mount path.

## [0.2.1] - 2026-07-01

### Added

- Added host management with SSH terminal access and Docker TLS certificate support for managed hosts.
- Added dynamic sandbox egress proxy management, Tor-only sandbox egress, image-scoped sandbox control ports, and proxied noVNC access with container ownership control.
- Added bilingual product documentation and a manual GitHub Pages deployment script.
- Added sandbox artifact triage skills and a quick-open action for sub-agent messages.

### Changed

- Reworked the sandbox proxy into a modular Go proxy with shell, files, WebSocket, entry proxy, egress proxy, and PTY resize handling.
- Replaced the WorkProject graph renderer with Cytoscape.
- Strengthened coordinator and specialist agent instructions around coverage, retesting, MITRE ATT&CK-aligned methodology, and failure-seeking completion review.
- Refined frontend layout, resource styling, playground streaming behavior, sandbox controls, and admin resource interactions.

### Fixed

- Fixed the default database port mismatch between runtime configuration and Docker Compose.
- Fixed first-message playground streaming so REST-submitted turns render immediately.
- Fixed host password field display, sandbox container hash display, Select prefix icon spacing, and Semi UI button usage.
- Hardened git ignore coverage and normalized sandbox skill resource path handling.

## [0.2.0] - 2026-06-10

### Added

- Added WorkProject attack-chain graphing with assets, findings, attack paths, and auditable record snapshots.
- Added project workspace views for graph exploration, record review, and richer project editing.
- Added Mermaid diagram enforcement and rendering in playground transcripts.

### Changed

- Refined WorkProject tool contracts around assets, findings, task summaries, shared task updates, graph edges, and attack paths.
- Improved project graph layout, task label wrapping, and frontend resource presentation.
- Repositioned README and landing copy around authorized red-team research and controlled multi-agent workflows.

### Fixed

- Consolidated WorkProject record snapshot flow and hardened record persistence.
- Aligned generated API contracts, frontend constants, and backend tool schemas for WorkProject records.
- Moved JWT authentication from bearer authorization to the custom access-token header contract.

## [0.1.1] - 2026-06-05

### Added

- Added paginated `read_subagent_task(run_id, offset)` result and error reads so large subagent outputs can be consumed in chunks.
- Added subtle playground message scrollbars that appear during wheel, touch, and keyboard scrolling.

### Changed

- Kept subagent completion notifications metadata-only; parent agents now read result bodies through `read_subagent_task`.
- Split Vite app and landing entrypoints into dedicated root/config files.

### Fixed

- Kept subagent streams alive across main agent graph rebinds by giving each subagent driver its own bound graph.
- Hardened instance config refresh and agent pool rebuild handling, including restart reporting and rollback on rebuild failure.
- Replaced frontend-only random agent row IDs with stable agent codes in system configuration editing.
- Stored sandbox image size as `bigint`.

## [0.1.0] - 2026-06-03

### Added

- Initial public preview release of Z3r0.
- Multi-agent security workbench with coordinator and specialist agents for code audit, intelligence, penetration validation, reverse engineering, and cryptography review.
- FastAPI backend with authentication, system configuration, work projects, sandbox image/container management, and agent session APIs.
- React workbench with playground chat, session replay, subagent progress, sandbox selection, file manager, shell access, and admin pages.
- Docker-backed sandbox execution for controlled command execution, async jobs, browser/noVNC workflows, and file access.
- Interrupt-driven agent runtime with resumable turns, async command completion notifications, subagent delegation, and context compaction.
- Persistent timeline event log for live streaming and replay.
- Docker Compose production quickstart with PostgreSQL and bundled frontend serving.

### Security

- Added explicit authorized-use and legal boundary documentation.
- Runtime configuration uses local `.z3r0/config.json`, with `.z3r0/config.json.example` as the tracked template.
- Sandbox and Docker socket access are documented as high-privilege deployment surfaces.

### Known Notes

- `docker-compose.prod.yml` includes default PostgreSQL and pgAdmin credentials for local evaluation; change them before exposing the service.
- The application container mounts `/var/run/docker.sock`; deploy only on trusted, isolated hosts.
