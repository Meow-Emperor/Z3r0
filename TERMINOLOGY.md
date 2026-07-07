# Terminology Standard

This file defines the canonical product terminology shared by Z3r0 and XuanWu.
Use these terms when writing UI text, API descriptions, Agent prompts, docs,
configuration examples, changelog entries, and handoff notes.

## Rules

- Keep protocol, framework, product, API, runtime, and tool terms in English.
- Chinese text may explain a term, but it must not replace the canonical term
  when the term is a technical identifier or product concept.
- Keep enum values, API fields, route paths, event names, storage keys, and
  tool names unchanged unless a migration is explicitly planned.
- Keep product names distinct: `Z3r0` for upstream, `XuanWu` / `玄武` for the
  enterprise distribution.
- In XuanWu Chinese copy, the `cso` role is named `总领安全官`.
- In Chinese sentences, separate embedded English technical terms with spaces,
  for example `Agent 协作`, `sandbox 容器`, and `egress proxy`.

## Canonical Terms

| Concept | Canonical term | XuanWu Chinese guidance |
| --- | --- | --- |
| Agent runtime actor | Agent | Use `Agent`; avoid replacing it with `智能体` in technical contexts. |
| Background delegated Agent | subagent | Use `subagent`; Chinese explanation may say `后台委派 Agent`. |
| Agent team lead code | `cso` | Role name: `总领安全官`. |
| CSO role | Chief Security Officer | XuanWu display role: `总领安全官`. |
| Code audit role | Chief Audit Engineer | Keep role code `cae`. |
| Intelligence role | Chief Intelligence Engineer | Keep role code `cie`. |
| Penetration role | Chief Penetration Engineer | Keep role code `cpe`. |
| Reverse engineering role | Chief Reverse Engineer | Keep role code `cre`. |
| Cryptography role | Chief Cryptography Engineer | Keep role code `cce`. |
| Project evidence object | WorkProject | Use `WorkProject` for the product/domain object. |
| Execution boundary | sandbox | Use `sandbox`; Chinese explanation may say `隔离执行环境`. |
| Container screen access | noVNC | Keep exact capitalization. |
| Shell access | Shell | Keep `Shell`; do not translate to a different technical term. |
| Network egress policy | egress | Use `egress` for the technical policy concept. |
| Egress proxy | egress proxy | Use `egress proxy`; avoid `出口代理` in technical labels. |
| Managed proxy mode | managed proxy | Keep `proxy` in English. |
| Direct egress mode | Direct | Use `Direct` in labels. |
| Tor egress mode | Tor | Use `Tor` or `Tor egress`; do not translate as an anonymity network. |
| HTTP proxy | HTTP proxy | Keep `HTTP` uppercase. |
| HTTPS proxy | HTTPS proxy | Keep `HTTPS` uppercase. |
| SOCKS5 proxy | SOCKS5 proxy | Keep `SOCKS5` uppercase. |
| API contract | OpenAPI | Keep `OpenAPI`. |
| Authentication token | token | Keep `token`; use `access token` when specific. |
| Model provider | model provider | Keep `model` in English when referring to AI model configuration. |
| Front Matter | Front Matter | Keep exact capitalization in Knowledge files. |
| MITRE ATT&CK | MITRE ATT&CK | Keep exact spelling. |

## Review Checklist

- UI labels for protocol choices must use `HTTP proxy`, `HTTPS proxy`, `SOCKS5 proxy`, `Direct`, `managed proxy`, and `Tor`.
- API schemas may localize descriptions, but canonical technical terms must stay in English.
- Agent-facing prompts must preserve role codes, tool names, and runtime terms.
- Changelog and README text must not introduce translated substitutes for the canonical terms above.
