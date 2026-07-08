---
name: openssl
description: Use openssl for authorized TLS, certificate, key, CSR, digest, signature, encoding, and protocol-material inspection inside the sandbox.
---

# openssl

Use `openssl` for authorized inspection of TLS endpoints and cryptographic material such as certificates, chains, CSRs, public keys, digests, signatures, encodings, and protocol evidence.

## Help First

Before constructing commands, run the installed help and subcommand help as needed:

```sh
openssl help
openssl <subcommand> -help
```

## Usage Rules

- Work only on in-scope endpoints or provided cryptographic artifacts.
- Prefer inspection and verification over transformation.
- Do not generate, overwrite, export, or convert private key material unless the user explicitly requests it and the scope permits it.
- Do not paste private keys, secrets, full certificates with sensitive context, or long binary encodings into the conversation.
- Save certificates, chains, handshake transcripts, and decoded outputs to files when they are large or sensitive.
- Treat protocol and certificate observations as evidence for review; do not overstate cryptographic exploitability without separate validation.

## Common Workflows

Capture a TLS handshake and certificate chain:

```sh
openssl s_client -connect example.com:443 -servername example.com -showcerts </dev/null > tls-handshake.txt
```

Inspect a certificate file:

```sh
openssl x509 -in cert.pem -noout -subject -issuer -dates -fingerprint -sha256
openssl x509 -in cert.pem -noout -text
```

Hash an artifact:

```sh
openssl dgst -sha256 artifact.bin
```

Verify that endpoint findings with time, SNI, port, and command context are recorded because TLS state can change.

## Output

Report the target or artifact, command used, key observations, relevant validity/issuer/subject/fingerprint details when applicable, output paths, and any verification errors.
