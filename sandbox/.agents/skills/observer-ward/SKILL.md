---
name: observer-ward
description: Use observer_ward for authorized web application and service fingerprint identification against in-scope HTTP targets.
---

# observer-ward

Use `observer_ward` for authorized service and web application fingerprint identification. Use it when HTTP probing, browser review, DNS output, or user-provided URLs need product, middleware, version, CPE-style, or community fingerprint context before deeper validation.

Skill name is `observer-ward`; the installed CLI command is `observer_ward`.

## Help First

Before constructing commands, run the installed help and use it as the source of truth:

```sh
observer_ward --help
```

## Usage Rules

- Work only on explicitly authorized targets.
- Use `-t` / `--target` for one or more explicit targets, `-l` / `--list` for a file with one target per line, or stdin for pipeline input.
- Keep target sets bounded. For large lists, write results to a file with `-o` / `--output`.
- Use only output or evidence flags shown by the installed `observer_ward --help`; do not assume advanced output formats or debug flags.
- Treat fingerprints as leads. Cross-check important product or version matches with headers, page content, certificates, browser output, or another tool before reporting them as confirmed.
- Use `httpx` first for liveness and normalization; use `observer_ward` after a target is known to be HTTP-facing and needs product or middleware fingerprint context.
- Do not run update, plugin, daemon, MITM, webhook, API server, MCP, or Redis/asynq modes unless the user explicitly asks for that workflow and the scope permits it.

## Common Workflows

Fingerprint one target:

```sh
observer_ward -t https://example.com
```

Fingerprint a bounded target list and save output:

```sh
observer_ward -l targets.txt -o observer-ward.txt
```

## Output

Report the target scope, command used, output path, matched products or technologies, evidence type, confidence, and validation gaps.
