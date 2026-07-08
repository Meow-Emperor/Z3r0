---
name: nmap
description: Use for authorized host discovery, port scanning, service/version detection, NSE script checks, network inventory, and local network diagnostics with the nmap CLI.
---

# nmap

Use `nmap` for bounded, authorized network reconnaissance. Keep scan scope explicit, targeted, and matched to the task.

## Help First

Before constructing or explaining any `nmap` command, execute the installed CLI help command and use that raw output as the source of truth:

```sh
nmap --help
```

## Usage Rules

- Work only on explicitly authorized hosts, networks, or local diagnostics.
- Keep scan scope, timing, ports, scripts, and output files explicit.
- Prefer targeted service checks over broad scans unless the user authorizes the broader scope.
- Save larger scan outputs to files rather than streaming them into the conversation.
- Treat NSE results and service versions as evidence to validate before reporting impact.

## Common Workflows

Targeted service/version scan for known ports:

```sh
nmap -sV -p 22,80,443 -oA nmap-target 192.0.2.10
```

Default script and version check for web ports:

```sh
nmap -sC -sV -p 80,443 -oN nmap-web.txt example.com
```

Bounded TCP discovery when host discovery is unreliable or blocked:

```sh
nmap -Pn --open -p 1-1000 -oA nmap-tcp 192.0.2.0/28
```

Use NSE scripts only when the script purpose, target service, and authorization are explicit.

## Output

- Report target scope, command used, open ports, detected services, versions, and any script findings.
