# PDF Presenter Suite — Workspace Rules

## Release & Documentation Synchronization Invariants

Whenever bumping versions or publishing a release to Git / GitHub:

1. **Update `README.md` Content (Not Just Version Numbers):**
   - Always audit `README.md` against `CHANGELOG.md` and recent commits since the last tag.
   - Update the **What's New**, **Key Features**, **REST API Endpoints**, and **Download Links** in `README.md` as well as the release notes body in `.github/workflows/release.yml` so the public GitHub landing page accurately reflects all newly shipped features.
2. **Synchronize All Versioned Files:**
   - Keep version numbers identical across `package.json`, `package-lock.json`, `AppxManifest.xml` (`X.Y.Z.0`), `README.md`, `CHANGELOG.md`, `js/diagnostics-engine.js`, `js/launcher.js`, `views/launcher.html`, and `views/presenter.html`.
3. **Cross-Platform Test Determinism (Windows & macOS CI):**
   - Never rely on host-dependent OS metrics (such as `os.freemem()` on macOS where inactive cached RAM reduces reported `freemem` below 800 MB) to alter deterministic unit test outcomes, as `.github/workflows/release.yml` gates releases on `npm test` passing on both `windows-latest` and `macos-latest`.
4. **Verify GitHub Actions Release Pipeline Post-Push:**
   - After pushing a `v*` tag, inspect the triggered GitHub Actions workflow run (`https://api.github.com/repos/SHARUNJOSEPH/pdf-presenter/actions/runs`) and `/releases/latest` to confirm that `Publish Official Release` succeeds and the README `Latest Release` badge updates.
