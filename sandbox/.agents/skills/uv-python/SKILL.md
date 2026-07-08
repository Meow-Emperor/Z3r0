---
name: uv-python
description: Use uv for missing Python dependencies, task-scoped virtual environments, temporary execution, and non-preinstalled Python tools.
---

# uv-python

Use `uv` for missing Python dependencies, task-scoped virtual environments, temporary execution, and Python tools that are not already preinstalled. The image is configured to prefer the existing `/usr/bin/python3` and to avoid uv-managed Python downloads.

## Skill Loading Required

Before using `uv` to run or install a tool, load the dedicated skill for that tool when one exists. Do not use `uvx`, `uv run --with`, or `uv tool install` to recreate a bundled tool such as `sqlmap`, `pwntools`, `checksec`, or any tool listed by `sandbox-shell`.

## Help First

Before constructing commands, use installed help as the source of truth:

```sh
uv --help
uv tool --help
uv pip --help
```

## Usage Rules

- Prefer preinstalled tools and their dedicated skills. Check `command -v <tool>` and installed help before any install step.
- Create task virtual environments with `uv venv --python /usr/bin/python3 <dir>` only when a script needs dependencies outside the bundled toolset.
- Install missing project dependencies with `uv pip install --python <dir>/bin/python ...`.
- Run temporary Python tools with `uvx --python /usr/bin/python3 <tool>` or `uv tool run --python /usr/bin/python3 <tool>` only when no preinstalled equivalent exists.
- Install persistent Python CLI tools with `uv tool install --python /usr/bin/python3 --no-python-downloads <tool>` only when repeated use is required and the tool is not already in the image.
- Run one-off Python with extra packages using `uv run --python /usr/bin/python3 --with <package> python ...` only for missing dependencies or a deliberately isolated environment.
- Prefer the existing `/usr/bin/python3`; do not let uv download another Python unless the user explicitly asks.
- Do not use global `pip install` unless the user explicitly asks and the reason is recorded.

## Common Workflows

Create an isolated task environment:

```sh
uv venv --python /usr/bin/python3 .venv
uv pip install --python .venv/bin/python requests
```

Run one-off Python with a temporary dependency:

```sh
if python3 -c 'import requests' 2>/dev/null; then
  python3 script.py
else
  uv run --python /usr/bin/python3 --with requests python script.py
fi
```

Run a temporary CLI tool without installing it globally, only when it is not already bundled:

```sh
command -v ruff >/dev/null || uvx --python /usr/bin/python3 ruff --help
```

Install a persistent Python CLI tool only when it is absent and meant to stay available for repeated task use:

```sh
command -v <tool> >/dev/null || uv tool install --python /usr/bin/python3 --no-python-downloads <tool>
```

## Output

Report the uv command used, virtual environment or tool path, installed packages, and any reproducibility notes.
