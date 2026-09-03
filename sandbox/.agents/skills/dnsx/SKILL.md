---
name: dnsx
description: Use ProjectDiscovery dnsx for authorized, small-batch DNS resolution, record lookup, and hostname validation at conservative rates.
---

# dnsx

Use ProjectDiscovery `dnsx` to validate discovered hostnames and collect DNS records for in-scope assets.

## Help first

Before constructing commands, run the installed help and use it as the source of truth:

```sh
dnsx -h
```

## Usage rules

- Work only on in-scope domains, hostnames, or resolver tests.
- Prefer a small, reviewed file or stdin batch. Do not feed unbounded discovery output directly into `dnsx`.
- Confirm the input count before execution and split unexpectedly large lists into reviewed batches.
- Use JSON output when results will be parsed or attached as evidence.
- Treat DNS answers as time-sensitive and resolver-dependent.
- Keep concurrency and query rates low by default, and save non-trivial outputs to files.
- Use `dnsx` for batch validation and DNS records from discovered host lists; use `dig`, `nslookup`, or `whois` for targeted manual triage.

## Common workflows

Resolve a discovered host list:

```sh
dnsx -l names.txt -silent -threads 3 -rate-limit 10 -o resolved.txt
```

Write JSONL evidence when later parsing matters:

```sh
dnsx -l names.txt -silent -threads 3 -rate-limit 10 -json -o dnsx.jsonl
```

Use a resolver file only when the task requires controlled resolver behavior:

```sh
dnsx -l names.txt -r resolvers.txt -silent -threads 3 -rate-limit 10 -o resolved.txt
```

## Output

Report input scope, command used, resolver or record mode when relevant, output path, resolved count, and notable records.
