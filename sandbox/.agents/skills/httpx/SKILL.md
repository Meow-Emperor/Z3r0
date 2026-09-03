---
name: httpx
description: Use ProjectDiscovery httpx for authorized, low-rate HTTP availability checks, response triage, and lightweight technology signals.
---

# httpx

Use ProjectDiscovery `httpx` for low-rate HTTP checks of in-scope hosts and URLs. Use it to validate HTTP/HTTPS availability and collect status, title, redirect, TLS, and lightweight technology signals. This is the ProjectDiscovery CLI, not the Python `httpx` library.

## Help first

Before constructing commands, run the installed help and use it as the source of truth:

```sh
httpx -h
```

## Usage rules

- Work only on explicitly authorized targets.
- Prefer a single URL or a small, reviewed file or stdin batch. Do not feed unbounded discovery output directly into `httpx`.
- Confirm the input count before execution and split unexpectedly large lists into reviewed batches.
- Prefer JSON output when results will be parsed with `jq` or consumed by another tool.
- Use silent/no-color output modes when piping to avoid mixing progress text with data.
- Save large outputs to files rather than streaming them into the conversation.
- Treat detected technologies, titles, redirects, and TLS observations as triage signals; validate important claims with response evidence, browser inspection, or targeted follow-up.
- Keep concurrency and request rates low by default. Do not use update, cloud/dashboard upload, screenshot, headless browser, or high-concurrency modes unless the user explicitly asks and the scope permits it.

## Common workflows

Probe a small, reviewed host list and keep structured evidence:

```sh
httpx -l hosts.txt -silent -threads 5 -rate-limit 10 -status-code -title -tech-detect -follow-redirects -json -o httpx.jsonl
```

Probe a single URL before browser review:

```sh
printf '%s\n' 'https://example.com' | httpx -silent -threads 1 -rate-limit 2 -status-code -title -tech-detect
```

Use `jq` on JSONL output for counts, filtering, or downstream input:

```sh
jq -r 'select(.status_code == 200) | .url' httpx.jsonl
```

## Output

Report the target scope, command used, output path, live hosts, status/title/technology signals, and any validation gaps.
