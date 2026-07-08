---
name: pwntools
description: Use preinstalled pwntools for authorized exploit prototyping, binary interaction, cyclic patterns, packing, and shellcraft tasks.
---

# pwntools

Use `pwntools` for authorized exploit prototyping, binary interaction, cyclic patterns, packing helpers, shellcraft tasks, and its bundled helper CLIs such as `pwn` and `checksec`.

## Help First

Before constructing commands, use installed CLI help and the preinstalled `pwntools` Python environment:

```sh
pwn --help
pwn_python="$(dirname "$(readlink -f "$(command -v pwn)")")/python"
"$pwn_python" -c 'from pwn import context; print(context.arch)'
```

## Usage Rules

- Work only against provided binaries, local challenge services, or explicitly authorized targets.
- Prefer the preinstalled `pwntools` tool environment for one-off scripts: `pwn_python="$(dirname "$(readlink -f "$(command -v pwn)")")/python"; "$pwn_python" <script.py>`.
- Do not install `pwntools` again for normal use.
- Use `uv venv --python /usr/bin/python3 <dir>` for task-scoped projects only when extra Python dependencies are missing. Install those missing dependencies into the venv; install `pwntools` into that venv only when isolation from the preinstalled tool environment is explicitly required.
- Use the preinstalled `pwn` CLI for quick helpers.
- Use the preinstalled `checksec` CLI for pure ELF mitigation checks instead of writing a pwntools script or installing another checksec package.
- Use `uv run --python /usr/bin/python3 --with pwntools python <script.py>` only when a separate ephemeral environment is explicitly needed. It does not reuse the preinstalled `uv tool` environment and first use may spend 30-60 seconds resolving and installing `pwntools`.
- Keep scripts, payloads, and generated artifacts in a task-scoped directory.
- Avoid printing secrets or live credentials; redact sensitive material in reports.
- Validate exploit assumptions with `checksec`, `gdb-pwndbg`, `strace`, or controlled test runs.
- Do not use global `pip install`.

## Common Workflows

Generate and locate cyclic patterns:

```sh
pwn cyclic 200
pwn cyclic -l 0x6161616b
```

Run a task-scoped script without global installs:

```sh
pwn_python="$(dirname "$(readlink -f "$(command -v pwn)")")/python"
"$pwn_python" exploit.py
```

Minimal local interaction template:

```python
from pwn import *

context.binary = elf = ELF("./binary")
io = process(elf.path)
io.sendlineafter(b"> ", b"input")
io.interactive()
```

Use `remote(host, port)` only for explicitly authorized challenge services or test infrastructure.

## Output

Report script path, command used, target scope, generated artifacts, key offsets or primitives, and validation status.
