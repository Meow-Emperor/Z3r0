---
name: amass
description: Use OWASP Amass for authorized asset discovery, domain enumeration, and DNS intelligence on in-scope targets.
---

# amass

Use OWASP `amass` for authorized asset discovery and domain intelligence when `subfinder` alone is not enough.

## Help First

Before constructing commands, run the installed help and use it as the source of truth:

```sh
amass -h
amass enum -h
```

## Usage Rules

- Work only on explicitly authorized domains, organizations, or netblocks.
- Start with passive or bounded enumeration unless active probing is explicitly authorized.
- Keep output in a task-scoped directory because Amass can create databases and graph data.
- Validate discovered names with `dnsx` and HTTP-facing assets with `httpx` before reporting them as live.
- Avoid broad brute force, alteration, or active modes unless the scope and rate limits are clear.
- Do not duplicate a completed `subfinder` pass by default; run Amass when its broader data model, state directory, or active options add value.

## Common Workflows

Run a passive first pass and keep Amass state in the task directory:

```sh
amass enum -passive -d example.com -dir amass-data -o amass.txt
```

Run against a bounded domain list:

```sh
amass enum -passive -df domains.txt -dir amass-data -o amass.txt
```

Validate Amass output before reporting live assets:

```sh
dnsx -l amass.txt -silent -o amass-resolved.txt
httpx -l amass-resolved.txt -silent -status-code -title -o amass-http.txt
```

## Output

Report the authorized scope, command used, output directory, result counts, validated assets, and any unresolved assumptions.
