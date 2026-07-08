---
name: subfinder
description: Use subfinder for authorized passive subdomain enumeration against in-scope domains and organization-owned assets.
---

# subfinder

Use ProjectDiscovery `subfinder` for authorized passive subdomain enumeration against explicitly in-scope domains.

## Help First

Before constructing commands, run the installed help and use it as the source of truth:

```sh
subfinder -h
```

## Usage Rules

- Work only on domains covered by the user's authorization.
- Prefer passive enumeration unless the user explicitly authorizes broader discovery.
- Save large result sets to files and keep one domain or bounded domain lists per run.
- Treat subdomain results as unverified leads until they resolve with `dnsx` or another DNS check.
- Use `subfinder` as the default first passive pass; use `amass` when the task needs deeper asset intelligence, Amass state, or active/broader modes.
- Do not add or modify provider API keys unless the user explicitly supplies them for the task.

## Common Workflows

Run passive enumeration for one in-scope domain:

```sh
subfinder -d example.com -silent -o subfinder.txt
```

Run a bounded list-based pass:

```sh
subfinder -dL domains.txt -silent -o subfinder.txt
```

Validate discovered names before treating them as live:

```sh
dnsx -l subfinder.txt -silent -o resolved.txt
httpx -l resolved.txt -silent -status-code -title -o httpx.txt
```

## Output

Report the input domain scope, command used, output path, result count, notable names, and validation status.
