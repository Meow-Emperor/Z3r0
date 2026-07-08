---
name: seclists
description: Use the built-in SecLists wordlists for authorized discovery, fuzzing, credential audits, and payload selection.
---

# seclists

Use the built-in SecLists copy as the default wordlist source for authorized discovery and fuzzing tasks. Treat it as the archive snapshot bundled at image build time.

## Resource Paths

SecLists is installed at:

```text
/opt/seclists
/usr/share/seclists
```

Use `/usr/share/seclists` in commands unless a task needs the canonical install path.

## Usage Rules

- Choose wordlists that match the task: DNS, web content, parameters, usernames, passwords, payloads, or fuzzing.
- Start with small or technology-specific lists before broad lists.
- Do not use credential wordlists against live services without explicit authorization and lockout-safe limits.
- Record the exact wordlist path used because it is part of the evidence trail.
- Combine with `ffuf`, `gobuster`, `hydra`, or custom scripts only within the authorized scope.
- Treat the bundled wordlists as build-time snapshot data. The image build can pin or change that snapshot with `SECLISTS_REF`.
- Keep wordlist selection here as the canonical guidance; tool-specific skills should reference paths without duplicating the SecLists catalog.

## Wordlist Selection

Select wordlists at runtime from the relevant SecLists area instead of assuming specific filenames are stable across upstream snapshots:

```text
/usr/share/seclists/Discovery/Web-Content
/usr/share/seclists/Discovery/DNS
/usr/share/seclists/Usernames
/usr/share/seclists/Passwords
/usr/share/seclists/Fuzzing
/usr/share/seclists/Payloads
```

Pick candidate files at runtime with broad, task-oriented patterns and verify the selected path before a long run:

```sh
find /usr/share/seclists/Discovery/Web-Content -maxdepth 2 -type f | sort | sed -n '1,40p'
wordlist="$(find /usr/share/seclists/Discovery/Web-Content -maxdepth 2 -type f -iname '*small*' | sort | sed -n '1p')"
test -n "$wordlist"
test -f "$wordlist"
```

## Output

Report the selected wordlist path, why it fits the task, and any tool command that consumed it.
