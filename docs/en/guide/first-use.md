---
title: First Use
editLink: true
---

# First Use

This guide introduces the primary Z3r0 modules and walks through initial resource configuration and an authorized CTF project workflow.

## System Overview

Access the configured listening address and port to enter the landing page:

![landing-1](/images/landing-1.png)

Click `Open workbench` to open the login page:

![login-1](/images/login-1.png)

Enter the configured administrator account and password. After successful authentication, the management console is displayed.

The system contains the following core modules:

1. Playground: provides session-based interaction and collaboration with the Agent team.
2. Work Projects: manages authorized scope, graph-targeted workflow, evidence, findings, attack paths, decisions, and sessions.
3. Knowledges: manages document ingestion, vector inspection, semantic retrieval, and knowledge graph exploration.
4. Host Management: manages host nodes and orchestrates the runtime environment for sandbox containers.
5. Egress Proxies: manages unified network egress through HTTP, HTTPS, and SOCKS5 proxies.
6. Sandbox Images: manages customized sandbox images, including the default image with sandbox-local skills and preloaded security tooling.
7. Sandbox Containers: orchestrates runnable sandbox containers with command execution, files, noVNC/browser review, and egress configuration.
8. System Users: manages system users, roles, and related identity information.
9. System Config: manages Agent runtime, Agent models, and independent LightRAG embedding and extraction configuration.

## Start Working

The following sections configure execution resources, create a project, and run an authorized CTF workflow from a clean system state.

### Manage Knowledge Documents

Knowledges turns assessment playbooks, research notes, reports, and other reference material into a searchable knowledge collection. Upload one or more Markdown or PDF documents, then follow their processing status while the collection is parsed and indexed.

The Documents view presents each source, its processing state, content summary, extracted text, and parsing details. The Vectors view exposes the original text segments and source metadata used by retrieval. The Knowledge Graph view supports semantic search across entities and relationships, with related areas available for progressive exploration. Together, these views provide a traceable review path from source material to retrieval content and graph relationships.

After indexing, the managed document content, vectors, and graph relationships form the retained knowledge representation, so the uploaded source file does not need to remain available. Deleting a document removes its indexed text and graph contributions from the collection.

Building knowledge graphs with LightRAG Core provides matching original document chunks and graph context for task-oriented inputs. Retrieval follows the active request and conversation focus, allowing follow-up work to remain grounded in relevant source material as the task develops.

### Connect a Host

Z3r0 adds the local machine to Host Management during startup, so a remote host is optional. A dedicated remote host is recommended when workload isolation, privilege separation, independent capacity, or centralized operational management is required.

Follow the steps below to configure and connect a remote host.

**1. Install Docker and configure the Remote API with mutual TLS authentication**

```bash
curl -fsSL https://get.docker.com | bash -s docker
wget https://raw.githubusercontent.com/yv1ing/Z3r0/refs/heads/main/sandbox/init_host.sh && chmod +x init_host.sh
```

Run `bash ./init_host.sh`, enter the host IP address, and wait for certificate generation and automatic configuration to complete. The Docker client certificates are written to the current directory:

![init-host-1](/images/init-host-1.png)

On some distributions, you may need to manually edit the Docker service to avoid daemon configuration conflicts:

```bash
systemctl edit docker.service
```

Add the following content to the blank editor area:

```text
[Service]
ExecStart=
ExecStart=/usr/bin/dockerd
```

![init-host-2](/images/init-host-2.png)

Restart the Docker service:

```bash
systemctl restart docker
```

**2. Create a host record and fill in the connection information**

In the `Host Management` module, click `Create Host` to open the edit form. Fill in the remote host IP address, port, account, password, and Docker certificate information, then save the record.

> Use mutual TLS whenever Docker Remote API traffic leaves the local host. Plain mode should be limited to explicitly trusted, isolated networks with independent access controls.

![create-host-1](/images/create-host-1.png)

**3. Connect to the host and build the sandbox image**

Z3r0 provides a web terminal that can connect directly to the remote host over SSH. Follow the instructions in [Quick Start](./quick-start#build-the-sandbox) to build the sandbox image.

![create-host-2](/images/create-host-2.png)

### Create an Image

In the `Sandbox Images` module, create an image record. The image name must match the name of the image that was actually built:

![create-image-1](/images/create-image-1.png)

### Create a Container

In the `Sandbox Containers` module, create a container and select the corresponding remote host and sandbox image. During container creation, you can specify the container egress mode. Z3r0 supports direct connection, HTTP, HTTPS, SOCKS5, and Tor. HTTP, HTTPS, and SOCKS5 require proxy entries to be configured in advance in the `Egress Proxies` module.

![create-container-1](/images/create-container-1.png)

### Test the Container

After the sandbox container is created, use the action buttons on the right side of the list item to operate it. Start the container, then access the sandbox through the web terminal, file manager, and noVNC display.

![create-container-2](/images/create-container-2.png)

### Create a Project

Using an authorized CTF challenge as the target, create a project in `Work Projects`. Fill in the project name, type, description, owners, and sandbox binding. Declare each known scope asset with a kind, canonical locator, name, and criticality. Declared assets are immediately `in_scope`; assets discovered later remain contextual until the lead Agent confirms scope.

![create-project-1](/images/create-project-1.png)

### Execute the Workflow

After the WorkProject is created, it appears in `Playground`. Open it, create a session, and assign the authorized objective to the Agent team. The lead Agent reads the scope and graph, prepares WorkItems with target assets and completion criteria, then coordinates the appropriate specialist for each assignment.

![project-example-1](/images/project-example-1.png)

During execution, open the project workspace to review the eight operational views:

- `Overview` summarizes scope coverage, current assignments, findings, paths, evidence, and active Agents.
- `Workflow` connects each assignment to assets, test surfaces, dependencies, coverage conclusions, WorkItem-attributed evidence, decisions, and subordinate runs; status and assignee filters support focused review.
- `Graph` presents environment structure, connectivity, dependencies, identity, trust, data flow, and provenance without mixing in offensive actions.
- `Assets` distinguishes declared scope, discovered context, out-of-scope entities, criticality, and stable locators.
- `Findings` presents validation, severity, impact, remediation, disposition, CWE/CVSS, affected assets, and supporting evidence.
- `Attack Paths` reconstructs continuous offensive steps with blockers, evidence, and optional ATT&CK mappings.
- `Evidence` preserves WorkItem-attributed immutable observations with source references, integrity hashes, supersession, and lifecycle state.
- `Activity` records business-significant state and plan changes, decisions, blockers, handoffs, and results.

Each specialist receives the assignment, target coverage, supporting Evidence, surrounding graph, and relevant retest opportunities needed for the current task. Evidence remains attributed to the WorkItem as relationships, findings, and path steps are validated. Once every target has a conclusion and the result is ready, the lead Agent can accept the work or return specific target surfaces for further analysis. Useful negative results remain available as evidence and can close a test surface without inventing a vulnerability. New credentials, trust relationships, routes, versions, code paths, and keys bring related follow-up and retest work into view.

![project-example-2](/images/project-example-2.png)

![project-example-3](/images/project-example-3.png)
