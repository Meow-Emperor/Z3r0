<p align="center">
  <img src="assets/z3r0-logo.png" width="156" alt="Z3r0 logo" />
</p>

<p align="center">
  <strong>English</strong> ·
  <a href="README_zh.md">中文</a>
</p>

<p align="center">
  <a href="#architecture">Architecture</a> ·
  <a href="#runtime-flow">Runtime Flow</a> ·
  <a href="#evidence-model">Evidence Model</a> ·
  <a href="#sandbox-and-egress">Sandbox and Egress</a> ·
  <a href="https://yv1ing.github.io/Z3r0/en/">Documentation</a> ·
  <a href="https://yv1ing.github.io/Z3r0/en/guide/quick-start">Quick Start</a>
</p>

<p align="center">
  <strong>Open-source red team collaboration workbench for authorized penetration testing, vulnerability discovery, code auditing, and security research.</strong>
</p>

---

> :warning: **Security Notice**
>
> This project is intended only for security testing, risk assessment, and academic research within legal and explicitly authorized scopes. It must not be used for unlawful, unauthorized, or destructive purposes.
>
> This project does not grant permission to test, access, scan, or affect any third-party systems, networks, services, accounts, or data.
>
> **The author is not responsible for any consequences, losses, damages, legal liabilities, or unlawful behavior caused by users.**

## Overview

Z3r0 is a control-plane-oriented red team workbench. It combines a React operator console, a FastAPI management plane, a session-based multi-agent runtime, project-scoped evidence records, distributed Docker sandbox resources, and a controlled egress layer.

The design goal is to make agent-assisted security work operationally bounded and reviewable. Conversations are not treated as the only source of truth. Project scope, assets, findings, relationship graph edges, attack paths, sandbox resources, egress policy, and replayable timeline events are represented as explicit application data.

## Architecture

```mermaid
flowchart TB
  Operator["Authorized Operator"]
  Workbench["React Workbench<br/>Playground / Projects / Sandboxes / Egress"]
  API["FastAPI Control Plane<br/>REST + WebSocket"]

  subgraph Runtime["Agent Runtime Plane"]
    Session["Session Runtime"]
    Graph["Session Agent Graph"]
    Team["Lead + Specialist Agents"]
    Timeline["Timeline Event Stream"]
  end

  subgraph Evidence["Evidence Plane"]
    Project["WorkProject"]
    Records["Assets / Findings / Edges / Paths"]
    Tasks["Tasks / Agent Summaries"]
  end

  subgraph Execution["Execution Plane"]
    Hosts["Managed Docker Hosts"]
    Containers["Sandbox Containers"]
    ControlProxy["Sandbox Control Proxy"]
    Egress["Local Egress Proxy"]
  end

  Store[("PostgreSQL")]

  Operator --> Workbench
  Workbench -->|REST| API
  Workbench -->|WebSocket| API
  API --> Session --> Graph --> Team
  Team --> Records
  Team --> Containers
  Session --> Timeline
  Project --> Records
  Project --> Tasks
  Hosts --> Containers --> ControlProxy --> Egress
  API --> Project
  API --> Hosts
  API --> Containers
  API --> Egress
  Timeline --> Store
  Records --> Store
  Tasks --> Store
  Project --> Store
  Containers --> Store
```

Z3r0 separates the system into four architectural planes:

| Plane | Scope |
| --- | --- |
| Control plane | Users, system configuration, agents, sessions, WorkProjects, managed hosts, sandbox images, sandbox containers, and egress proxies. |
| Runtime plane | Multi-agent session execution, live event streaming, long-running task continuity, history projection, and timeline replay. |
| Evidence plane | Project scope, assets, findings, relationship graph, attack paths, task progress, and per-agent summaries. |
| Execution plane | Docker hosts, sandbox containers, shell/file/noVNC access, command execution, sandbox-local skills, built-in security tooling, and outbound network policy. |

This separation is reflected in the repository structure: routers and handlers expose application contracts, services own domain behavior, models define persistent state, and the React workbench consumes the stable REST/WebSocket surface.

## Runtime Flow

```mermaid
sequenceDiagram
  participant UI as React Workbench
  participant API as FastAPI
  participant Pool as Session Runtime
  participant Agents as Agent Graph
  participant Tools as Tool Layer
  participant Project as WorkProject
  participant Sandbox as Sandbox Pool
  participant DB as PostgreSQL

  UI->>API: Submit scoped message
  API->>Pool: Start or resume session
  Pool->>Agents: Execute lead or specialist agent
  Agents->>Tools: Invoke project, knowledge, sandbox, or delegation tools

  alt Evidence operation
    Tools->>Project: Create or update assets, findings, graph edges, paths
    Project->>DB: Persist structured evidence
  else Sandbox operation
    Tools->>Sandbox: Execute command / read output / use shell, files, noVNC
    Sandbox->>DB: Persist task state and output metadata
  else Background work
    Tools->>DB: Persist resumable task state
    DB-->>Pool: Result becomes available
    Pool->>Agents: Resume result integration
  end

  Pool->>DB: Persist normalized timeline events
  Pool-->>API: Stream transcript events
  API-->>UI: Live view and replayable history
```

The runtime is designed for assessments that outlive a single browser interaction. The frontend can stream live events, reload persisted timeline pages, switch sessions, inspect subagent work, and open project records without depending on provider-specific model events. Long-running commands and specialist tasks are represented as application state, so results can be integrated after they complete instead of forcing the operator to wait in a blocking turn.

## Evidence Model

```mermaid
flowchart LR
  Scope["Declared Scope"]
  Assets["Assets<br/>service / domain / network / binary"]
  Edges["Relationship Graph<br/>structural + offensive edges"]
  Findings["Findings<br/>proof + impact + status"]
  Paths["Attack Paths<br/>ordered edge traversal"]
  Review["Review Surface<br/>records + graph + timeline"]

  Scope --> Assets
  Assets --> Edges
  Assets --> Findings
  Edges --> Findings
  Edges --> Paths
  Findings --> Review
  Paths --> Review
```

WorkProject is the durable evidence boundary for professional review. Assets are graph nodes. Relationships describe architecture or attack progression. Findings attach proof and impact to affected assets and, when needed, to a specific relationship. Attack paths are ordered traversals through the graph.

| Data object | Role in the assessment |
| --- | --- |
| WorkProject | Assessment container for owners, type, status, scope assets, sandbox bindings, sessions, tasks, and summaries. |
| Asset | Normalized target or discovered object: service, domain, network, or binary. |
| Finding | Security observation with severity, status, proof, impact, and optional graph binding. |
| Graph edge | Directed relationship between two assets, either structural or offensive. |
| Attack path | Ordered path over graph edges, used to reconstruct access or impact progression. |

This model keeps evidence independent from model context. Agent summaries can remain compact while durable facts stay queryable, visualizable, and reviewable.

## Sandbox and Egress

```mermaid
flowchart TB
  Project["WorkProject"]
  Runtime["Agent / Operator Session"]
  Pool["Sandbox Resource Pool"]
  HostA["Managed Host A"]
  HostB["Managed Host B"]
  ContainerA["Sandbox Container"]
  ContainerB["Sandbox Container"]
  Control["Sandbox Control Proxy<br/>shell / files / noVNC / egress API"]
  LocalProxy["In-container Egress Proxy<br/>127.0.0.1:8118"]
  Policy["Egress Policy"]
  Direct["Direct"]
  HTTP["HTTP / HTTPS"]
  SOCKS["SOCKS5"]

  Project --> Pool
  Runtime --> Pool
  Pool --> HostA --> ContainerA
  Pool --> HostB --> ContainerB
  ContainerA --> Control --> LocalProxy --> Policy
  ContainerB --> Control
  Policy --> Direct
  Policy --> HTTP
  Policy --> SOCKS
```

Sandboxing is treated as infrastructure, not as an incidental tool call. Administrators manage Docker hosts, sandbox images, running containers, exposed ports, and project bindings. Operators and agents work through selected running containers, and the same sandbox boundary supports command execution, shell sessions, file management, browser/noVNC review, and sandbox-local skills.

The default sandbox image is a preloaded security workspace rather than a bare shell. It includes reconnaissance and DNS tools (`subfinder`, `amass`, `dnsx`, `dig`, `whois`), HTTP probing and web discovery tools (`httpx`, `ffuf`, `gobuster`, `observer_ward`, `sqlmap`, `nmap`), bounded credential-testing support (`hydra`), Android and firmware analysis tools (`jadx`, `apktool`, `Ghidra`, `binwalk`), binary and pwn tooling (`gdb`, Pwndbg, `strace`, `ltrace`, `pwntools`, and the `pwntools`-provided `checksec`), browser automation through `agent-browser-cli`, and a built-in SecLists wordlist corpus. Python tooling is intentionally centered on `uv` so task environments, one-off Python runs, and persistent Python CLIs use explicit interpreter selection instead of ad hoc global `pip` installs.

Outbound traffic is normalized through a container-level egress profile. The sandbox runtime exports proxy environment variables to a local proxy inside the container; the control plane can update the upstream policy to direct access or a managed HTTP, HTTPS, or SOCKS5 proxy. This gives the platform a unified place to manage network identity, traffic routing, and operator-environment isolation.

## Technical Highlights

| Highlight | Description |
| --- | --- |
| Multi-agent orchestration | A lead agent coordinates specialist agents for intelligence gathering, validation, code audit, reverse analysis, and cryptanalysis. |
| Project evidence plane | WorkProject turns transient investigation output into persistent records, graph relationships, paths, tasks, and summaries. |
| Replayable event timeline | The UI consumes normalized timeline events that can be streamed live or loaded later as history. |
| Distributed sandbox resources | Managed Docker hosts, images, and containers allow execution environments to be isolated, scaled, and assigned to projects. |
| Preloaded sandbox toolchain | The default sandbox image bundles recon, DNS, web discovery, credential testing, Android, firmware, reverse engineering, browser, Python, and wordlist capabilities behind sandbox-local skills. |
| Unified egress layer | Container traffic can be routed through direct, HTTP, HTTPS, or SOCKS5 modes using one platform-managed policy surface. |
| Operator workbench | The frontend combines chat, project records, graph review, sandbox selector, terminal, files, and noVNC into one workflow. |

## Expert Team

| Code | Name | Role | Responsibilities |
| --- | --- | --- | --- |
| `cso` | Z3r0 | Chief Security Lead | Task decomposition, team coordination, result integration |
| `cae` | V3ra | Code Audit Engineer | Source code auditing, dependency review, remediation verification |
| `cie` | L1ly | Intelligence Gathering Engineer | Intelligence gathering, asset discovery, relationship mapping |
| `cpe` | Fr4nk | Penetration Testing Engineer | Penetration testing, vulnerability validation, impact confirmation |
| `cre` | J4m3 | Reverse Analysis Engineer | Reverse analysis, firmware disassembly, binary unpacking |
| `cce` | Nu1L | Cryptography Engineer | Cryptographic analysis, key review, security assessment |

## Repository Layout

```text
core/        Agent specs, runtime, task runtime, delegation, context, tools
service/     Domain services for agent, sandbox, users, hosts, egress, projects
router/      FastAPI route declarations
handler/     HTTP and WebSocket request handling
model/       SQLModel database models
schema/      Pydantic API contracts
web/         React workbench and landing page
sandbox/     Docker sandbox image and control proxy
docs/        VitePress documentation
.z3r0/       Runtime configuration, agent prompts, knowledge files, logs
```

## Documentation

- [Overview](https://yv1ing.github.io/Z3r0/en/guide/overview)
- [Quick Start](https://yv1ing.github.io/Z3r0/en/guide/quick-start)
- [First Use](https://yv1ing.github.io/Z3r0/en/guide/first-use)
- [Join Community](https://yv1ing.github.io/Z3r0/en/guide/community)

## Acknowledgments

Thanks to the [Linux.do](https://linux.do/) website and its community for their support in project development and communication.

## License

This project is licensed under the [MIT License](LICENSE).
