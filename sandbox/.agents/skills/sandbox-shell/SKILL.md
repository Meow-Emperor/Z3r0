---
name: sandbox-shell
description: Use when a task requires shell-level work inside the sandbox, including environment setup, script writing, code execution, running preinstalled programs, downloads, missing dependency setup, scanning, or browser/tool CLIs.
---

# sandbox-shell

Use sandbox command tools for authorized task work inside the selected sandbox container.

## Skill Loading Required

- Before using any domain-specific tool, load and follow that tool's matching skill when one exists.
- Loading only `sandbox-shell` is not enough for specialized tools such as `agent-browser-cli`, `amass`, `apktool`, `binwalk`, `checksec`, `dnsx`, `ffuf`, `gdb-pwndbg`, `ghidra`, `gobuster`, `hydra`, `httpx`, `jadx`, `nmap`, `observer-ward`, `openssl`, `pwntools`, `seclists`, `sqlmap`, `strace-ltrace`, or `subfinder`.
- If no dedicated skill exists for a needed command, use this skill plus the installed command help as the source of truth.

## Usage Rules

- Prefer the sandbox image's preinstalled tools. Do not install, upgrade, reinstall, or replace a tool that is already available.
- Check an existing command with `command -v`, `--version`, or installed help before considering any install step.
- Use `uv` only for missing Python dependencies, task-scoped virtual environments, or tools that are not already present and are required for the task.
- Keep environment changes task-scoped. Do not use `apt`, global `pip`, curl-piped installers, or language package managers to overwrite bundled tools unless the user explicitly asks.

## Tool Contract

Command tools return compact JSON metadata; raw output is captured to `output_file`:

- `execute_sync_command` returns `status`, `output_file`, `output_bytes`, `output_lines`, and optional `exit_code`.
- `execute_async_command` returns only `status` and `run_id`; its terminal `status`, `exit_code`, and `output_file` are delivered later when the runtime resumes you.
- Status values: `running`, `completed`, `failed`, `canceled`.
- Read output with `read_sandbox_command_output` using `output_file` and `start_line: 1`, at most 200 lines per call. Do not use `cat`.

## Choosing Execution

Use `execute_sync_command` for short, local, bounded commands expected to finish within 30 seconds:

- file inspection, small scripts, local parsing, `command -v`, `test`, `sed -n`, `head`, `tail`, `wc`, bounded `grep`
- one sync command per assistant response unless the previous result requires an immediate bounded read

Use `execute_async_command` for anything slow, remote, stateful, or externally dependent:

- HTTP requests, downloads, scans, probes, brute-force checks, browser automation, missing dependency installs, builds, servers, watchers, REPLs
- loops around network, browser, dependency setup, build, scan, or other external resources
- consolidated scripts that run several slow checks and write structured output

Always pass timing arguments explicitly via `timeout_seconds`.

## Async Jobs

Dispatching `execute_async_command` ends the current turn immediately.

- After dispatching, do not continue working, run follow-up steps, or take any further action — your turn is over.
- The runtime resumes you automatically when the job finishes, delivering its `status`, `exit_code`, and `output_file` as fresh context.
- Never poll, read, or check a running job, and never use `sleep`, shell wait loops, or filler progress messages — there is nothing to do but wait to be resumed.
- Use `cancel_sandbox_async_job` only when cancellation is requested or the job is no longer useful.

## Output Handling

- When metadata has terminal `status` and `output_lines > 0`, read needed chunks with `read_sandbox_command_output`.
- Continue with the next `start_line` only when the next chunk is needed.
- Do not re-run a command just to inspect an existing `output_file`.
- Use a new bounded command only when file-side filtering/counting is more efficient than reading chunks.
- Keep generated files and installed packages scoped to the task.

## Python Packages

- Use `uv` only when the required Python package or CLI is not already preinstalled, or when task isolation is necessary.
- Create task virtual environments with `uv venv --python /usr/bin/python3 <dir>` when a script needs dependencies outside the bundled toolset.
- Install missing Python dependencies with `uv pip install --python <dir>/bin/python ...`.
- Run one-off Python commands with missing dependencies using `uv run --python /usr/bin/python3 --with <package> python ...`; avoid this for packages already provided by preinstalled tool environments.
- Run temporary CLI tools with `uvx --python /usr/bin/python3 <tool>` or `uv tool run --python /usr/bin/python3 <tool>` only when no preinstalled equivalent exists.
- Install persistent Python CLI tools with `uv tool install --python /usr/bin/python3 --no-python-downloads <tool>` only when repeated use is required and the tool is not already in the image.
- Prefer the existing `/usr/bin/python3`; `UV_PYTHON_DOWNLOADS=never` is set in the image, and another Python should be downloaded only when the user explicitly asks.
- Do not use global `pip install` or assume `pip3` is available unless the user explicitly asks and the reason is recorded.

## Available Tools

- Archives: `7z`, `unzip`, `tar`
- Shell/runtime: `python3`, `uv`, `uvx`, `node`, `npm`, `nc`, `jq`, `rg`, `git`, `sha256sum`
- Network: `curl`, `wget`, `dig`, `nslookup`, `whois`, `openssl`, `httpx`, `nmap`, `sqlmap`
- Recon: `subfinder`, `amass`, `dnsx`
- Web discovery: `ffuf`, `gobuster`
- Wordlists: `/usr/share/seclists`
- Credential testing: `hydra`
- Fingerprinting: `observer_ward`
- Android/reversing: `jadx`, `apktool`, `ghidra`, `analyzeHeadless`
- Reverse/pwn: `gdb`, `pwndbg`, `strace`, `ltrace`, `pwntools`, `checksec` from `pwntools`
- File/firmware: `file`, `binwalk`, `readelf`
- Browser: Chrome for Testing (`google-chrome`, `chrome`) and `agent-browser-cli`

## Tool Selection Boundaries

- `checksec` is provided by `pwntools`; do not install a separate checksec package.
- Use `subfinder` for the first passive subdomain pass, `amass` for deeper asset intelligence, and `dnsx` for batch DNS validation.
- Use `dns-whois` tools for targeted manual DNS or registration triage, not bulk validation.
- Use `httpx` for HTTP liveness and normalization, then `observer_ward` for product or middleware fingerprints.
- Use `ffuf` for flexible `FUZZ` placement and structured fuzzing output; use `gobuster` for simple mode-specific directory, DNS, or virtual-host enumeration.
- Use `gdb`/`pwndbg` for debugger state, `strace`/`ltrace` for runtime traces, and `pwntools` for repeatable binary interaction.

## Skill Resource Paths

Use `.agents/skills/<skill-name>/...` paths in sandbox commands for skill-shipped files:

- Ghidra wrapper: `.agents/skills/ghidra/scripts/ghidra-analyze.sh`

## Output

Report only meaningful results: changed files, commands run, relevant output, and failures that affect completion.
