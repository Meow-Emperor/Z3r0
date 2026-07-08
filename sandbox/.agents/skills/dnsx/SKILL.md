---
name: dnsx
description: Use ProjectDiscovery dnsx for authorized batch DNS resolution, record lookup, and validation of discovered hostnames.
---

# dnsx

Use ProjectDiscovery `dnsx` to validate discovered hostnames and collect DNS records for in-scope assets.

## Help First

Before constructing commands, run the installed help and use it as the source of truth:

```sh
dnsx -h
```

## Usage Rules

- Work only on in-scope domains, hostnames, or resolver tests.
- Prefer file or stdin input for host lists and keep batches bounded.
- Use JSON output when results will be parsed or attached as evidence.
- Treat DNS answers as time-sensitive and resolver-dependent.
- Save large outputs to files rather than streaming them into the conversation.
- Use `dnsx` for batch validation and DNS records from discovered host lists; use `dig`, `nslookup`, or `whois` for targeted manual triage.

## Common Workflows

Resolve a discovered host list:

```sh
dnsx -l names.txt -silent -o resolved.txt
```

Write JSONL evidence when later parsing matters:

```sh
dnsx -l names.txt -silent -json -o dnsx.jsonl
```

Use a resolver file only when the task requires controlled resolver behavior:

```sh
dnsx -l names.txt -r resolvers.txt -silent -o resolved.txt
```

## Output

Report input scope, command used, resolver or record mode when relevant, output path, resolved count, and notable records.
