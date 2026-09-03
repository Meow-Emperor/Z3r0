---
title: Overview
editLink: true
---

# Overview

Z3r0 is an AI-native red-team workbench for authorized penetration testing and vulnerability research, with specialist agents, sandboxed tooling, evidence records, and replayable timelines.

The platform follows a specialist operating model: a lead agent governs scope, decomposes graph-targeted work items, coordinates specialist agents, reviews evidence-backed outputs, and closes the engagement. The work project record remains useful beyond the conversation because scope, environment relationships, workflow decisions, evidence, findings, and attack paths are retained as explicit application data.

> :warning: Security notice
>
> This project is intended only for security testing, risk assessment, and academic research within legal and explicitly authorized scopes. It must not be used for unlawful, unauthorized, or destructive purposes.
>
> This project does not grant permission to test, access, scan, or affect third-party systems, networks, services, accounts, or data.
>
> **The author is not responsible for consequences, losses, damages, legal liabilities, or unlawful behavior caused by users.**

## Core capabilities

| Capability | Description |
| --- | --- |
| Multi-agent orchestration | A lead agent assigns work items to intelligence, penetration, code audit, reverse engineering, and cryptography specialists. |
| Graph-driven workflow | Each work item identifies in-scope assets, test surfaces, dependencies, completion criteria, and an optional relation, finding, or attack-path focus. |
| Durable evidence chain | Immutable evidence references command output, HTTP exchanges, code locations, artifacts, external sources, and useful negative results. |
| Findings and attack paths | Findings separate validation from disposition; attack paths retain continuous, evidence-backed steps from entry to target. |
| Replayable runtime | Normalized session events support live streaming, interruption, long-running work, recovery, and historical replay. |
| Controlled execution | Managed Docker sandboxes provide shell, files, browser/noVNC, skills, preloaded tooling, and container-level egress policy. |
| Retrieval context | LightRAG provides matching source chunks and knowledge-graph context for task-oriented inputs. |
| Operator workbench | Overview, Workflow, Graph, Assets, Findings, Attack paths, Evidence, and Activity views support professional review. |

## Architecture

```mermaid
flowchart TB
  Operator["Authorized operator"]
  API["FastAPI control plane"]
  Runtime["Session runtime"]
  Agents["Lead and specialist agents"]
  RAG["LightRAG context"]
  Tools["Project and sandbox tools"]
  Sandbox["Managed sandbox resources"]
  Project["Work project"]
  Graph["Asset graph"]
  Workflow["Work items and work log"]
  Evidence["Evidence"]
  Conclusions["Findings and attack paths"]
  Timeline["Replayable timeline"]
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

The control plane manages identities, projects, sessions, knowledge collections, execution resources, and outbound policy. Specialists receive assigned work items together with the relevant project and graph context. The evidence plane distinguishes environment facts from offensive actions: relations describe structure, connectivity, dependencies, identity, trust, data flow, and provenance; attack path steps describe exploitation and movement. PostgreSQL retains the shared operating record and session timeline.

## Work project model

```mermaid
flowchart LR
  Scope["Authorized scope"]
  Assets["Assets"]
  Relations["Environment relations"]
  Work["Graph-targeted work items"]
  Evidence["Work item-linked evidence"]
  Findings["Security findings"]
  Paths["Attack paths"]
  Review["Review and retest"]

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

Assets give the team a stable inventory of in-scope, contextual, and out-of-scope entities. Work items turn the graph into coordinated assignments by connecting specialists, target assets, test surfaces, dependencies, and review outcomes. Each specialist receives the current project context needed for its assignment, while evidence keeps observations attributable and traceable to source material. Findings bring together validation, impact, remediation, CWE/CVSS, and affected assets; attack paths reconstruct demonstrated offensive progression with optional ATT&CK mappings.

## Runtime sequence

```mermaid
sequenceDiagram
  participant UI as Operator workbench
  participant Lead as Lead agent
  participant Work as Work project
  participant Expert as Specialist agent
  participant Sandbox as Sandbox
  participant DB as PostgreSQL

  UI->>Lead: Submit authorized objective
  Lead->>Work: Read scope and graph state
  Lead->>Work: Finalize queued work item plans and dependencies
  Lead->>Expert: Delegate a graph-targeted work item
  Work-->>Expert: Inject current targets, evidence, and graph context
  Expert->>Sandbox: Perform authorized assessment action
  Sandbox-->>Expert: Return output reference
  Expert->>Work: Record immutable evidence
  Expert->>Work: Update relations, findings, or an attack path
  Expert->>Work: Update target coverage and result
  Expert->>Work: Submit the concluded work item for review
  Work-->>Lead: Present the work item for review
  Lead->>Work: Accept or reopen named targets for changes
  Lead-->>UI: Report confirmed results and residual gaps
  Work->>DB: Persist workflow, evidence, and conclusions
```

New assets, credentials, trust relationships, code paths, versions, keys, and routes surface relevant retest opportunities. The workbench keeps blocked assignments, deferred or suspected findings, and open path hypotheses visible alongside the surrounding graph and evidence, helping operators understand what changed and where follow-up work is most valuable. Search and structured filters provide direct access to the relevant workflow, asset, finding, and evidence records during review.

## Expert team

| Code | Name | Role | Responsibilities |
| --- | --- | --- | --- |
| `cso` | Z3r0 | Chief security lead | Scope governance, work item planning, coordination, review, and closure |
| `cae` | V3ra | Code audit engineer | Source review, dependency analysis, vulnerability tracing, and remediation review |
| `cie` | L1ly | Intelligence engineer | Asset discovery, ownership correlation, exposure analysis, and relationship mapping |
| `cpe` | Fr4nk | Penetration engineer | Live testing, vulnerability validation, attack progression, and impact confirmation |
| `cre` | J4m3 | Reverse engineer | Binary, firmware, mobile, protocol, and artifact analysis |
| `cce` | Nu1L | Cryptography engineer | Protocol, primitive, certificate, token, and key-management review |
