---
name: archive-file-triage
description: Use file, 7z, unzip, tar-compatible tools, hashes, and bounded shell inspection for safe triage of provided archives and unknown files.
---

# archive-file-triage

Use local file and archive tools for safe triage of provided archives, unknown files, evidence bundles, source packages, firmware packages, and extracted artifacts.

## Help First

Before constructing commands, use installed help or version output as the source of truth:

```sh
file --help
7z i
unzip -h
tar --help
```

## Usage Rules

- Work only on explicitly provided files or task-scoped outputs.
- Identify file type and size before extraction.
- Extract only into a task-scoped output directory.
- Preserve original files and record hashes when identity matters.
- Prefer listing archive contents before extraction.
- Do not execute extracted content.
- Watch for path traversal, absolute paths, symlinks, excessive file counts, nested archives, and unexpectedly large expansion.
- Save large listings and extraction logs to files rather than streaming them into the conversation.

## Common Workflows

Identify and hash before extraction:

```sh
file artifact.bin
sha256sum artifact.bin
```

List archive contents first:

```sh
7z l archive.7z
unzip -l archive.zip
tar -tf archive.tar
```

Extract into a task-scoped directory:

```sh
mkdir -p extracted
7z x archive.7z -oextracted
unzip archive.zip -d extracted
tar -xf archive.tar -C extracted
```

After extraction, inspect file types before any deeper analysis:

```sh
find extracted -maxdepth 2 -type f -exec file '{}' +
```

## Output

Report the input path, type, size, hashes when relevant, command used, output directory, notable extracted paths, suspicious archive behavior, and limitations.
