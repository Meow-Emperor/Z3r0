---
name: ffuf
description: Use ffuf for authorized web directory, parameter, and virtual-host fuzzing with bounded wordlists and rates.
---

# ffuf

Use `ffuf` for authorized web content discovery, parameter fuzzing, and virtual-host checks on in-scope HTTP targets.

## Help First

Before constructing commands, run the installed help and use it as the source of truth:

```sh
ffuf -h
```

## Usage Rules

- Work only on in-scope URLs, hosts, parameters, and virtual host targets.
- Choose the smallest appropriate wordlist under `/usr/share/seclists`; do not start with broad recursive lists by default.
- Set bounded rate, timeout, recursion, and match/filter behavior suitable for the target.
- Save JSON, CSV, or normal output to files for anything larger than a quick check.
- Validate interesting responses manually with `curl`, `httpx`, or browser review before reporting.
- Prefer `ffuf` over `gobuster` when arbitrary `FUZZ` placement, parameter fuzzing, request-header fuzzing, or structured JSON output is needed.
- Select SecLists files at runtime with broad patterns and verify the selected path before long runs.

## Common Workflows

Directory/content discovery with bounded rate and JSON output:

```sh
find /usr/share/seclists/Discovery/Web-Content -maxdepth 2 -type f | sort | sed -n '1,40p'
wordlist="$(find /usr/share/seclists/Discovery/Web-Content -maxdepth 2 -type f -iname '*small*' | sort | sed -n '1p')"
test -n "$wordlist"
test -f "$wordlist"
ffuf -u https://example.com/FUZZ -w "$wordlist" -rate 50 -timeout 10 -of json -o ffuf-dir.json
```

Virtual host discovery:

```sh
find /usr/share/seclists/Discovery/DNS -maxdepth 2 -type f | sort | sed -n '1,40p'
wordlist="$(find /usr/share/seclists/Discovery/DNS -maxdepth 2 -type f -iname '*subdomain*' | sort | sed -n '1p')"
test -n "$wordlist"
test -f "$wordlist"
ffuf -u https://example.com/ -H 'Host: FUZZ.example.com' -w "$wordlist" -rate 50 -timeout 10 -of json -o ffuf-vhost.json
```

Parameter fuzzing against a known endpoint:

```sh
find /usr/share/seclists/Discovery/Web-Content -maxdepth 2 -type f | sort | sed -n '1,40p'
wordlist="$(find /usr/share/seclists -maxdepth 3 -type f -iname '*param*' | sort | sed -n '1p')"
test -n "$wordlist"
test -f "$wordlist"
ffuf -u 'https://example.com/search?FUZZ=test' -w "$wordlist" -rate 50 -timeout 10 -of json -o ffuf-params.json
```

Use filters such as `-fc`, `-fs`, or `-fw` only after comparing baseline responses.

## Output

Report target scope, command used, wordlist path, filters, output path, interesting hits, and validation status.
