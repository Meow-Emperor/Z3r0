---
name: strace-ltrace
description: Use strace and ltrace for authorized syscall and library-call tracing of provided binaries and processes.
---

# strace-ltrace

Use `strace` and `ltrace` for syscall and library-call tracing during authorized runtime analysis.

## Help First

Before constructing commands, use installed help or version output as the source of truth:

```sh
strace --help
ltrace --help
```

## Usage Rules

- Trace only provided binaries, task-scoped test programs, or authorized processes.
- Save traces to files for anything beyond a short bounded run.
- Set follow-fork, string length, syscall filters, and timeout behavior deliberately.
- Treat command-line arguments, environment values, file paths, and network endpoints as potentially sensitive.
- Do not run untrusted samples unless execution is explicitly authorized.

## Common Workflows

Trace a short local run and follow child processes:

```sh
strace -f -s 256 -o strace.log -- ./program arg1
```

Focus on file, process, and network syscalls:

```sh
strace -f -s 256 -e trace=file,process,network -o strace-focused.log -- ./program
```

Trace dynamic library calls when the binary is dynamically linked:

```sh
ltrace -f -o ltrace.log -- ./program arg1
```

Attach only to authorized processes:

```sh
strace -p 1234 -o strace-pid.log
```

## Output

Report traced program or PID, command used, output path, notable syscalls or library calls, and any sensitive data handling.
