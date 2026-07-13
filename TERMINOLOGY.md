# Product Terminology

This glossary describes the principal concepts presented across Z3r0 and its XuanWu enterprise distribution.

| Concept | Product term | Meaning |
| --- | --- | --- |
| Upstream product | Z3r0 | Open-source red team collaboration workbench. |
| Enterprise distribution | XuanWu / 玄武 | Enterprise distribution derived from Z3r0. |
| Runtime participant | Agent | Lead or specialist model participant in an assessment session. |
| Delegated background participant | subagent | Agent assigned a bounded task that can complete independently and return results to its parent. |
| Team lead | `cso` / Chief Security Officer | Coordinates task planning, delegation, and result integration. XuanWu presents this role as `总领安全官`. |
| Code audit specialist | `cae` / Chief Audit Engineer | Reviews source code, dependencies, and remediation outcomes. |
| Intelligence specialist | `cie` / Chief Intelligence Engineer | Performs intelligence gathering, asset discovery, and relationship mapping. |
| Penetration specialist | `cpe` / Chief Penetration Engineer | Validates vulnerabilities and confirms security impact. |
| Reverse analysis specialist | `cre` / Chief Reverse Engineer | Analyzes binaries, firmware, and packaged applications. |
| Cryptography specialist | `cce` / Chief Cryptography Engineer | Reviews cryptographic design, implementation, and key handling. |
| Assessment evidence boundary | WorkProject | Project container for scope, sessions, assets, findings, relationships, attack paths, tasks, and summaries. |
| Isolated execution boundary | sandbox | Managed container environment for commands, files, browser access, and security tooling. |
| Container screen access | noVNC | Browser-based access to the graphical desktop inside a sandbox container. |
| Interactive command access | Shell | Terminal access to a managed host or sandbox container. |
| Outbound network policy | egress | Routing policy applied to traffic leaving a sandbox container. |
| Outbound relay | egress proxy | Managed upstream used by a sandbox container for HTTP, HTTPS, or SOCKS5 traffic. |
| Direct routing mode | Direct | Egress mode that connects without a managed upstream proxy. |
| Tor routing mode | Tor | Egress mode that routes supported traffic through Tor. |
| API contract | OpenAPI | Machine-readable contract for the REST API and generated frontend types. |
| Authentication credential | access token | Credential used to authenticate API and WebSocket access. |
| Model connection | model provider | API endpoint, credential, and model selection used by an Agent or LightRAG Core. |
| Retrieval engine | LightRAG Core | Document parsing, entity and relationship extraction, vector retrieval, and graph retrieval engine. |
| Retrieved reference data | RAG context | Current-turn context selected from indexed documents and graph relationships. |
| Knowledge administration | Knowledges | Administration module for documents, vectors, semantic search, and knowledge graph exploration. |
| Security knowledge framework | MITRE ATT&CK | Framework used to describe adversary tactics and techniques. |
