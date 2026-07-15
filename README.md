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

Z3r0 is a control-plane-oriented red team workbench. It combines a React operator console, a FastAPI management plane, a session-based multi-Agent runtime, project-scoped evidence records, distributed Docker sandbox resources, and a controlled egress layer.

Z3r0 brings authorized scope, asset relationships, specialist assignments, evidence, findings, attack paths, workflow decisions, sandbox resources, and session timelines into one shared workspace. Red teams can coordinate execution, follow assessment progress, trace conclusions to supporting material, and review the complete operation without reconstructing state from separate conversations and tools.

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
    RAG["LightRAG Core"]
    Timeline["Timeline Event Stream"]
  end

  subgraph Evidence["Evidence Plane"]
    Project["WorkProject"]
    GraphData["Assets / Environment Relations"]
    Workflow["WorkItems / Targets / WorkLog"]
    Conclusions["Evidence / Findings / Attack Paths"]
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
  API --> RAG
  Session --> RAG
  Team --> Workflow
  Workflow --> GraphData
  Workflow --> Conclusions
  Team --> Containers
  Session --> Timeline
  Project --> GraphData
  Project --> Workflow
  Project --> Conclusions
  Hosts --> Containers --> ControlProxy --> Egress
  API --> Project
  API --> Hosts
  API --> Containers
  API --> Egress
  Timeline --> Store
  GraphData --> Store
  Workflow --> Store
  Conclusions --> Store
  Project --> Store
  Containers --> Store
  RAG --> Store
```

Z3r0 separates the system into four architectural planes:

| Plane | Scope |
| --- | --- |
| Control plane | Users, system configuration, Agents, sessions, WorkProjects, Knowledges, managed hosts, sandbox images, sandbox containers, and egress proxies. |
| Runtime plane | Multi-Agent session execution, task-input LightRAG retrieval, live event streaming, long-running task continuity, history projection, and timeline replay. |
| Evidence plane | Authorized scope, asset relationships, graph-targeted WorkItems, immutable evidence, findings, attack paths, target coverage, and workflow decisions. |
| Execution plane | Docker hosts, sandbox containers, shell/file/noVNC access, command execution, sandbox-local skills, built-in security tooling, and outbound network policy. |

This separation is reflected in the repository structure: routers and handlers expose application contracts, services own domain behavior, models define persistent state, and the React workbench consumes the stable REST/WebSocket surface.

## Runtime Flow

```mermaid
sequenceDiagram
  participant UI as React Workbench
  participant API as FastAPI
  participant Pool as Session Runtime
  participant Agents as Agent Graph
  participant RAG as LightRAG Core
  participant Tools as Tool Layer
  participant Project as WorkProject
  participant Sandbox as Sandbox Pool
  participant DB as PostgreSQL

  UI->>API: Submit scoped message
  API->>Pool: Start or resume session
  Pool->>RAG: Retrieve semantically related context
  RAG-->>Pool: Return documents, entities, and relationships
  Pool->>Agents: Execute lead or specialist Agent
  Agents->>Tools: Invoke project, sandbox, or delegation tools

  alt Graph-driven operation
    Tools->>Project: Load WorkItem targets and graph neighborhood
    Tools->>Project: Record evidence, relations, findings, and path steps
    Project->>DB: Persist coverage, evidence, conclusions, and decisions
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


## Evidence Model

```mermaid
flowchart LR
  Scope["Authorized Scope"]
  GraphData["Asset Graph<br/>structure / connectivity / trust / data"]
  Work["Graph-targeted WorkItems<br/>targets / dependencies / coverage"]
  Evidence["WorkItem-linked Evidence<br/>stable reference / provenance / hash"]
  Findings["Security Findings<br/>validation / severity / disposition"]
  Paths["Attack Paths<br/>evidence-backed offensive steps"]
  Review["Review<br/>workflow / graph / conclusions / activity"]

  Scope --> GraphData --> Work --> Evidence
  Evidence --> GraphData
  Evidence --> Findings --> Paths --> Review
  Work --> Paths
  Work --> Review
```

WorkProject provides a durable workspace for each assessment. Operators can explore the target environment as an asset graph, assign specialists to specific assets and test surfaces, review the evidence produced by each assignment, and follow validated offensive progression through attack paths. Findings and path conclusions remain connected to their supporting material, giving the team a coherent record from initial scope through review and retesting.

| Data object | Role in the assessment |
| --- | --- |
| WorkProject | Assessment boundary for owners, authorized scope, sandbox bindings, sessions, workflow, and closure. |
| Asset | Canonically identified network, host, domain, service, application, endpoint, code, artifact, identity, data, or cloud entity. |
| Relation | Evidence-matured environment assertion covering structure, connectivity, dependencies, identity, trust, data flow, or provenance. |
| WorkItem | Coordinated action unit connecting an assigned specialist with graph targets, dependencies, test surfaces, completion criteria, evidence, coverage conclusions, and lead review. |
| Evidence | Immutable WorkItem-attributed observation with provenance, a stable source reference, supersession, and guarded invalidation. |
| Finding | Evidence-backed security conclusion with validation, impact, disposition, and severity kept consistent with optional CVSS scoring. |
| Attack path | Continuous sequence of offensive actions from entry to target, with evidence and optional ATT&CK mapping per step. |

The workbench gives operators a unified view of scope coverage, current assignments, blocked test surfaces, review queues, validated findings, attack paths, evidence, and specialist activity. Leads can review completed work, return specific target surfaces for further validation, and use focused search and filters to move quickly from project-level posture to the relevant asset, assignment, evidence chain, or security conclusion.

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

Sandbox resources are managed infrastructure. Administrators manage Docker hosts, sandbox images, running containers, exposed ports, and project bindings. Operators and Agents work through selected running containers, and the same sandbox boundary supports command execution, Shell sessions, file management, browser/noVNC review, and sandbox-local skills.

The default sandbox image provides a preloaded security workspace. It includes reconnaissance and DNS tools (`subfinder`, `amass`, `dnsx`, `dig`, `whois`), HTTP probing and web discovery tools (`httpx`, `ffuf`, `gobuster`, `observer_ward`, `sqlmap`, `nmap`), bounded credential-testing support (`hydra`), Android and firmware analysis tools (`jadx`, `apktool`, `Ghidra`, `binwalk`), binary and pwn tooling (`gdb`, Pwndbg, `strace`, `ltrace`, `pwntools`, and the `pwntools`-provided `checksec`), browser automation through `agent-browser-cli`, and a built-in SecLists wordlist corpus. Python workflows use `uv` for managed task environments, one-off runs, and persistent Python CLIs.

Outbound traffic is normalized through a container-level egress profile. The sandbox runtime exports proxy environment variables to a local proxy inside the container; the control plane can update the upstream policy to direct access or a managed HTTP, HTTPS, or SOCKS5 proxy. This gives the platform a unified place to manage network identity, traffic routing, and operator-environment isolation.

## Technical Highlights

| Highlight | Description |
| --- | --- |
| Multi-Agent orchestration | A lead Agent coordinates specialist Agents for intelligence gathering, validation, code audit, reverse analysis, and cryptanalysis. |
| Graph-driven operations | WorkProject binds specialist WorkItems to in-scope assets, test surfaces, evidence, findings, and attack-path validation. |
| Retrieval context plane | Building knowledge graphs with LightRAG Core provides matching original document chunks and graph context for task-oriented inputs. |
| Replayable event timeline | The UI consumes normalized timeline events that can be streamed live or loaded later as history. |
| Distributed sandbox resources | Managed Docker hosts, images, and containers allow execution environments to be isolated, scaled, and assigned to projects. |
| Preloaded sandbox toolchain | The default sandbox image bundles recon, DNS, web discovery, credential testing, Android, firmware, reverse engineering, browser, Python, and wordlist capabilities behind sandbox-local skills. |
| Unified egress layer | Container traffic can be routed through direct, HTTP, HTTPS, or SOCKS5 modes using one platform-managed policy surface. |
| Operator workbench | The frontend combines chat, workflow state, graph review, evidence chains, attack paths, sandbox selector, terminal, files, and noVNC. |

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
service/     Domain services for Agent, knowledge, sandbox, users, hosts, egress, projects
router/      FastAPI route declarations
handler/     HTTP and WebSocket request handling
model/       SQLModel database models
schema/      Pydantic API contracts
web/         React workbench and landing page
sandbox/     Docker sandbox image and control proxy
docs/        VitePress documentation
.z3r0/       Runtime configuration, Agent prompts, logs
.lightrag/   Temporary LightRAG parser inputs and local working files
```

## Documentation

- [Overview](https://yv1ing.github.io/Z3r0/en/guide/overview)
- [Quick Start](https://yv1ing.github.io/Z3r0/en/guide/quick-start)
- [First Use](https://yv1ing.github.io/Z3r0/en/guide/first-use)
- [Community](https://yv1ing.github.io/Z3r0/en/guide/community)

## Acknowledgments

Thanks to the [Linux.do](https://linux.do/) website and its community for their support in project development and communication.

## License

This project is licensed under the [MIT License](LICENSE).
