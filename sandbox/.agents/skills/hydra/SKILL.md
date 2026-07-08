---
name: hydra
description: Use hydra only for authorized, bounded authentication testing with explicit targets, protocols, accounts, and rate limits.
---

# hydra

Use `hydra` only for authorized authentication testing where the target service, account scope, wordlists, and limits are explicit.

## Help First

Before constructing commands, confirm the installed CLI and inspect help output. Hydra v9.5+ prints help for `-h` and exits 0; older builds may exit nonzero, so do not discard help output and do not use the exit status alone as a success probe:

```sh
command -v hydra
hydra -h 2>&1 | sed -n '1,80p'
```

## Usage Rules

- Work only on systems and accounts explicitly authorized for credential testing.
- Require a clear protocol, host, port, account list or username, password list, and stop condition.
- Use conservative task counts, delays, timeouts, and lockout-aware limits by default.
- Use built-in lists under `/usr/share/seclists` only when credential testing is explicitly authorized and lockout-safe limits are clear.
- Do not run broad password spraying, internet-wide tests, or destructive account-lockout workflows.
- Save output to a task-scoped file and avoid printing credential material unless it is necessary evidence.

## Common Workflows

SSH check for one authorized account with one worker:

```sh
hydra -l alice -P passwords.txt -s 22 -t 1 -o hydra-ssh.txt ssh://192.0.2.10
```

HTTP POST form check only when the failure marker is known:

```sh
hydra -l alice -P passwords.txt -t 1 -o hydra-http.txt 192.0.2.10 http-post-form '/login:username=^USER^&password=^PASS^:F=invalid'
```

Use `-L` for an authorized username file, `-p` for a single password, and `-P` for a password file. Keep `-t` conservative unless the user has provided safe limits.

## Output

Report scope, protocol, command used with sensitive values redacted when needed, rate limits, output path, and verified results.
