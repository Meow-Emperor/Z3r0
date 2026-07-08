---
name: gobuster
description: Use gobuster for authorized directory, DNS, and virtual-host enumeration with bounded wordlists.
---

# gobuster

Use `gobuster` for authorized directory, DNS, and virtual-host enumeration when a focused wordlist-driven run is appropriate.

## Help First

Before constructing commands, run the installed help and mode help as needed:

```sh
gobuster help
gobuster dir --help
gobuster dns --help
gobuster vhost --help
```

## Usage Rules

- Work only on authorized hosts, domains, and URL paths.
- Prefer small or medium wordlists under `/usr/share/seclists` unless the user approves a broader run.
- Set thread counts, timeout, status-code filters, and extensions deliberately.
- Save larger outputs to files and validate hits before reporting them as findings.
- Prefer `gobuster` for simple mode-specific directory, DNS, or virtual-host enumeration; use `ffuf` when the fuzz position or output format needs more flexibility.
- Select SecLists files at runtime with broad patterns and verify the selected path before long runs.

## Common Workflows

Directory discovery:

```sh
find /usr/share/seclists/Discovery/Web-Content -maxdepth 2 -type f | sort | sed -n '1,40p'
wordlist="$(find /usr/share/seclists/Discovery/Web-Content -maxdepth 2 -type f -iname '*small*' | sort | sed -n '1p')"
test -n "$wordlist"
test -f "$wordlist"
gobuster dir -u https://example.com/ -w "$wordlist" -t 20 --timeout 10s -o gobuster-dir.txt
```

DNS subdomain enumeration:

```sh
find /usr/share/seclists/Discovery/DNS -maxdepth 2 -type f | sort | sed -n '1,40p'
wordlist="$(find /usr/share/seclists/Discovery/DNS -maxdepth 2 -type f -iname '*subdomain*' | sort | sed -n '1p')"
test -n "$wordlist"
test -f "$wordlist"
gobuster dns -d example.com -w "$wordlist" -t 20 -o gobuster-dns.txt
```

Virtual host enumeration:

```sh
gobuster vhost -u https://example.com/ -w vhosts.txt -t 20 -o gobuster-vhost.txt
```

Use `vhosts.txt` for full virtual hostnames when the installed help does not show domain-append behavior. Use mode-specific help before adding filters such as status codes, extensions, or TLS behavior.

## Output

Report mode, target scope, command used, wordlist path, filters, output path, and validated results.
