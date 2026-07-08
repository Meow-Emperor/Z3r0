---
name: httpx
description: Use ProjectDiscovery httpx for authorized HTTP probing, live host validation, response triage, and lightweight web fingerprint collection.
---

# httpx

Use ProjectDiscovery `httpx` for authorized HTTP probing of in-scope hosts and URLs. Use it to validate HTTP/HTTPS liveness, normalize recon lists, and collect status, title, redirect, TLS, and lightweight technology signals. This is the ProjectDiscovery CLI, not the Python `httpx` library.

## Help First

Before constructing commands, run the installed help and use it as the source of truth:

```sh
httpx -h
```

## Usage Rules

- Work only on explicitly authorized targets.
- Prefer file or stdin input for target lists, and keep batches bounded.
- Prefer JSON output when results will be parsed with `jq` or consumed by another tool.
- Use silent/no-color output modes when piping to avoid mixing progress text with data.
- Save large outputs to files rather than streaming them into the conversation.
- Treat detected technologies, titles, redirects, and TLS observations as triage signals; validate important claims with response evidence, browser inspection, `observer_ward`, or targeted follow-up.
- Use `httpx` before `observer_ward` when raw hostnames or URLs need HTTP/HTTPS liveness and normalization.
- Do not use update, cloud/dashboard upload, screenshot, headless browser, or high-concurrency modes unless the user explicitly asks and the scope permits it.

## Common Workflows

Probe a resolved host list and keep structured evidence:

```sh
httpx -l hosts.txt -silent -status-code -title -tech-detect -follow-redirects -json -o httpx.jsonl
```

Probe a single URL before browser review:

```sh
printf '%s\n' 'https://example.com' | httpx -silent -status-code -title -tech-detect
```

Use `jq` on JSONL output for counts, filtering, or downstream input:

```sh
jq -r 'select(.status_code == 200) | .url' httpx.jsonl
```

## Output

Report the target scope, command used, output path, live hosts, status/title/technology signals, and any validation gaps.
