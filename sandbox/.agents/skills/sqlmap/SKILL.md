---
name: sqlmap
description: Use for authorized SQL injection testing with the sqlmap CLI, including detection, DBMS fingerprinting, request replay, and extraction checks against in-scope web targets.
---

# sqlmap

Use `sqlmap` only for authorized, in-scope SQL injection testing. Keep targets, parameters, request files, and risk level aligned with the task.

## Help First

Before constructing or explaining a `sqlmap` command, execute the installed CLI help command and use that raw output as the source of truth:

```sh
sqlmap --help
```

Use `sqlmap -hh` when advanced options are needed. Options such as `--fingerprint`, `--dbs`, and other enumeration or extraction switches are documented in `-hh`, not the short `--help` output. Derive options, syntax, tamper script usage, output flags, and request replay behavior from the current installed help output.

## Usage Rules

- Work only on explicitly authorized URLs, request files, parameters, and authentication contexts.
- Use a URL with a clear injectable parameter or a raw HTTP request file captured from the target workflow.
- Include required cookie, header, proxy, or authentication context needed to reproduce the request.
- Keep risk, level, tested parameters, and database actions aligned with the authorized scope.
- Avoid broad extraction unless it is explicitly requested and in scope.

## Common Workflows

Detection against one explicit URL parameter:

```sh
sqlmap -u 'https://example.com/item?id=1' -p id --batch --level 1 --risk 1
```

Replay a captured request file when cookies, headers, or body data matter:

```sh
sqlmap -r request.txt -p id --batch --level 1 --risk 1
```

Fingerprint only after a detection lead exists:

```sh
sqlmap -r request.txt -p id --batch --fingerprint
```

Use extraction options such as `--dbs` only when the user explicitly requests extraction and the authorization covers it.

## Output

- Report target scope, command used, tested parameter, injection result, DBMS fingerprint, and relevant findings.
- Include output paths when sqlmap writes session data or result files.
