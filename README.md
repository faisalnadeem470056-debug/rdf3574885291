# AI App Builder -- build repo

Builds the APKs and AABs for apps made in AI App Builder. Nothing here is edited
by hand: `node scripts/make-build-template.mjs` in the builder regenerates it.

- `template/` the Kotlin/Compose app shell and Gradle files.
- `scripts/prepare.mjs` assembles one app's project from `template/` + `job/`.
- `.github/workflows/build.yml` runs on every `app-*` branch the builder's
  server pushes (one branch per app), builds, signs and publishes a release.

Signing keys are never stored here. Each run proves itself to the builder's
server with GitHub's OIDC token and receives its account's key for that run only.
