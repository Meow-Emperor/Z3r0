---
title: Overview
editLink: true
---

# Overview

Z3r0 is an open-source red team collaboration workbench for authorized penetration testing, vulnerability research, code auditing, reverse engineering, cryptographic review, and controlled security research.

The platform follows a specialist operating model: a lead Agent governs scope, decomposes graph-targeted WorkItems, coordinates specialist Agents, reviews evidence-backed outputs, and closes the engagement. The project record remains useful beyond the conversation because scope, environment relationships, workflow decisions, evidence, findings, and attack paths are retained as explicit application data.

> :warning: Security Notice
>
> This project is intended only for security testing, risk assessment, and academic research within legal and explicitly authorized scopes. It must not be used for unlawful, unauthorized, or destructive purposes.
>
> This project does not grant permission to test, access, scan, or affect third-party systems, networks, services, accounts, or data.
>
> **The author is not responsible for consequences, losses, damages, legal liabilities, or unlawful behavior caused by users.**

## Core Capabilities

| Capability | Description |
| --- | --- |
| Multi-Agent orchestration | A lead Agent assigns WorkItems to intelligence, penetration, code audit, reverse engineering, and cryptography specialists. |
| Graph-driven workflow | Each WorkItem identifies in-scope assets, test surfaces, dependencies, completion criteria, and an optional relation, finding, or attack-path focus. |
| Durable evidence chain | Immutable Evidence references command output, HTTP exchanges, code locations, artifacts, external sources, and useful negative results. |
| Findings and attack paths | Findings separate validation from disposition; attack paths retain continuous, evidence-backed steps from entry to target. |
| Replayable runtime | Normalized session events support live streaming, interruption, long-running work, recovery, and historical replay. |
| Controlled execution | Managed Docker sandboxes provide shell, files, browser/noVNC, skills, preloaded tooling, and container-level egress policy. |
| Retrieval context | LightRAG provides matching source chunks and knowledge-graph context for task-oriented inputs. |
| Operator workbench | Overview, Workflow, Graph, Assets, Findings, Attack Paths, Evidence, and Activity views support professional review. |

## Architecture

```mermaid
flowchart TB
  Operator["Authorized Operator"]
  API["FastAPI Control Plane"]
  Runtime["Session Runtime"]
  Agents["Lead and Specialist Agents"]
  RAG["LightRAG Context"]
  Tools["Project and Sandbox Tools"]
  Sandbox["Managed Sandbox Resources"]
  Project["WorkProject"]
  Graph["Asset Graph"]
  Workflow["WorkItems and WorkLog"]
  Evidence["Evidence"]
  Conclusions["Findings and Attack Paths"]
  Timeline["Replayable Timeline"]
  Store[("PostgreSQL")]

  Operator --> API --> Runtime --> Agents --> Tools
  Runtime --> RAG --> Store
  Tools --> Sandbox --> Store
  Tools --> Project
  Project --> Graph --> Workflow
  Workflow --> Evidence --> Conclusions
  Evidence --> Graph
  Workflow --> Timeline
  Graph --> Store
  Workflow --> Store
  Evidence --> Store
  Conclusions --> Store
  Timeline --> Store
```

The control plane manages identities, projects, sessions, knowledge collections, execution resources, and outbound policy. Specialists receive assigned WorkItems together with the relevant project and graph context. The evidence plane distinguishes environment facts from offensive actions: Relations describe structure, connectivity, dependencies, identity, trust, data flow, and provenance; AttackPath steps describe exploitation and movement. PostgreSQL retains the shared operating record and session timeline.

## WorkProject Model

```mermaid
flowchart LR
  Scope["Authorized Scope"]
  Assets["Assets"]
  Relations["Environment Relations"]
  Work["Graph-targeted WorkItems"]
  Evidence["WorkItem-linked Evidence"]
  Findings["Security Findings"]
  Paths["Attack Paths"]
  Review["Review and Retest"]

  Scope --> Assets --> Relations
  Assets --> Work
  Relations --> Work
  Work --> Evidence
  Evidence --> Relations
  Evidence --> Findings
  Findings --> Paths
  Evidence --> Paths
  Work --> Review
  Paths --> Review
  Review --> Work
```

Assets give the team a stable inventory of in-scope, contextual, and out-of-scope entities. WorkItems turn the graph into coordinated assignments by connecting specialists, target assets, test surfaces, dependencies, and review outcomes. Each specialist receives the current project context needed for its assignment, while Evidence keeps observations attributable and traceable to source material. Findings bring together validation, impact, remediation, CWE/CVSS, and affected assets; attack paths reconstruct demonstrated offensive progression with optional ATT&CK mappings.

## Runtime Sequence

```mermaid
sequenceDiagram
  participant UI as Operator Workbench
  participant Lead as Lead Agent
  participant Work as WorkProject
  participant Expert as Specialist Agent
  participant Sandbox as Sandbox
  participant DB as PostgreSQL

  UI->>Lead: Submit authorized objective
  Lead->>Work: Read scope and graph state
  Lead->>Work: Finalize queued WorkItem plans and dependencies
  Lead->>Expert: Delegate a graph-targeted WorkItem
  Work-->>Expert: Inject current targets, evidence, and graph context
  Expert->>Sandbox: Perform authorized assessment action
  Sandbox-->>Expert: Return output reference
  Expert->>Work: Record immutable Evidence
  Expert->>Work: Update Relations, Findings, or AttackPath
  Expert->>Work: Update target coverage and result
  Expert->>Work: Submit concluded WorkItem for review
  Work-->>Lead: Present the WorkItem for review
  Lead->>Work: Accept or reopen named targets for changes
  Lead-->>UI: Report confirmed results and residual gaps
  Work->>DB: Persist workflow, evidence, and conclusions
```

New assets, credentials, trust relationships, code paths, versions, keys, and routes surface relevant retest opportunities. The workbench keeps blocked assignments, deferred or suspected Findings, and open path hypotheses visible alongside the surrounding graph and evidence, helping operators understand what changed and where follow-up work is most valuable. Search and structured filters provide direct access to the relevant workflow, asset, Finding, and Evidence records during review.

## Expert Team

| Code | Name | Role | Responsibilities |
| --- | --- | --- | --- |
| `cso` | Z3r0 | Chief Security Lead | Scope governance, WorkItem planning, coordination, review, and closure |
| `cae` | V3ra | Code Audit Engineer | Source review, dependency analysis, vulnerability tracing, and remediation review |
| `cie` | L1ly | Intelligence Engineer | Asset discovery, ownership correlation, exposure analysis, and relationship mapping |
| `cpe` | Fr4nk | Penetration Engineer | Live testing, vulnerability validation, attack progression, and impact confirmation |
| `cre` | J4m3 | Reverse Engineer | Binary, firmware, mobile, protocol, and artifact analysis |
| `cce` | Nu1L | Cryptography Engineer | Protocol, primitive, certificate, token, and key-management review |
