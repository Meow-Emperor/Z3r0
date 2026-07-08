---
name: dns-whois
description: Use dig, nslookup, whois, and related local CLIs for authorized DNS, WHOIS, ASN, mail, nameserver, and ownership triage.
---

# dns-whois

Use local DNS and WHOIS tools for authorized domain, host, nameserver, mail, address, ASN, registration, and ownership triage.

## Help First

Before constructing commands, use installed help or version output as the source of truth:

```sh
dig -h
whois --help
```

## Usage Rules

- Work only on in-scope domains, hosts, networks, or user-provided indicators.
- Record the exact queried identifier and query time when results support a finding.
- Prefer targeted record lookups over broad enumeration.
- Use `dnsx` instead when a discovered hostname list needs batch validation or machine-readable DNS output.
- Treat WHOIS, DNS, and registry data as time-sensitive intelligence that may be stale, proxied, incomplete, or privacy-protected.
- Cross-check important ownership, delegation, and resolution claims with independent DNS records or supporting evidence.
- Save large query batches and raw outputs to files rather than streaming them into the conversation.

## Common Workflows

Targeted DNS record triage:

```sh
dig example.com A
dig example.com AAAA
dig example.com MX
dig example.com NS
dig example.com TXT
```

Compact output for pipelines:

```sh
dig +short example.com A
```

Resolver-specific check:

```sh
dig @1.1.1.1 example.com A
```

WHOIS and basic resolver lookup:

```sh
whois example.com
nslookup example.com
```

## Output

Report the queried identifier, command used, relevant records or ownership signals, confidence, time sensitivity, output paths, and any unresolved or conflicting evidence.
