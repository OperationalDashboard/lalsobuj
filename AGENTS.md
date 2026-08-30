# Repository instructions

## Release versioning

- Every production-facing change must update the version in `client/package.json` and `client/package-lock.json`.
- Use semantic versions: patch for fixes, minor for backward-compatible features, and major for breaking changes.
- Add a dated entry to `CHANGELOG.md` describing the user-visible changes.
- Do not manually hard-code a Git build ID. Vite injects the current Render/Git revision automatically.
- Before deployment, run the client production build and verify that the Settings and sidebar version displays match the package version.
