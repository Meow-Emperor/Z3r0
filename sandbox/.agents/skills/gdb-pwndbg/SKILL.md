---
name: gdb-pwndbg
description: Use gdb and pwndbg for authorized binary debugging, crash triage, exploit development, and runtime inspection.
---

# gdb-pwndbg

Use system `gdb` for stock debugging. Pwndbg is installed through `uv` against `/usr/bin/python3`, and `/root/.gdbinit` sources the installed Pwndbg `gdbinit.py` so the normal `gdb` entrypoint has Pwndbg available without bundling another debugger.

## Help First

Before constructing commands, confirm the debugger entrypoints and Pwndbg integration:

```sh
gdb --help
command -v pwndbg
gdb -batch -ex 'python import pwndbg'
```

## Usage Rules

- Work only on provided binaries, task-scoped builds, or explicitly authorized targets.
- Do not execute unknown or untrusted samples unless runtime execution is explicitly in scope.
- Prefer batch commands for quick inspection and task-scoped output files for long sessions.
- Use `gdb` for the system debugger entrypoint; use `pwndbg` when the wrapper command is more convenient.
- Do not install another GDB or Pwndbg runtime; use the bundled system `gdb`, `pwndbg`, and `/root/.gdbinit` integration.
- Record binary path, hash when relevant, architecture, protections, crash inputs, and debugger commands used.
- Use `checksec` for the static mitigation baseline, `strace`/`ltrace` for runtime call traces, and `pwntools` for repeatable interaction or exploit scripts; do not treat them as debugger replacements.

## Common Workflows

Open an interactive Pwndbg-enhanced GDB session:

```sh
gdb -q ./binary
```

Run a bounded crash triage in batch mode:

```sh
gdb -q ./binary -ex 'set pagination off' -ex 'run' -ex 'bt' -ex 'info registers' -batch
```

Use a command file for repeatable sessions:

```sh
gdb -q ./binary -x gdb-commands.txt
```

Attach only to authorized local processes:

```sh
gdb -q -p 1234
```

Pair debugger observations with `checksec --file=./binary`, controlled inputs, and saved crash artifacts.

## Output

Report the debugger used, command file or command line, binary path, key observations, crash state, registers/backtrace when relevant, and output paths.
