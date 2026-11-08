# Archived mise migration pilot

The phase-one pilot is retired. Its temporary VM-only `verify` task and duplicate runtime config/lock are no longer active files. They were experimental migration scaffolding, not the permanent verification interface.

- [Historical results, limitations and artifact hashes](../../docs/mise-pilot-results.md)
- [Current verification commands](../../docs/testing.md)
- [Production runtime/deployment design](../../docs/mise-deployment.md)

The original experiment is preserved in local Git commit **`1831bdf`**. Inspect its exact files without activating them:

```sh
git show 1831bdf:mise/pilot/mise.toml
git show 1831bdf:mise/pilot/mise.lock
git show 1831bdf:mise/pilot/README.md
```

Production runtime versions have one authority: `mise/config.toml` and its native `mise/mise.lock`. Current integration tests exercise that configuration, not a second pilot pin set. Ordinary `mise run verify` is host-safe; `mise run verify:vm` is a separately guarded opt-in for prepared disposable macOS guests. Neither task is a first-Mac installer.
