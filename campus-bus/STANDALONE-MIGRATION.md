# Standalone repository migration

The shuttle-bus app is intentionally self-contained under `campus-bus/` and can be moved to a dedicated public repository without changing the application code.

## Recommended migration

1. Create a new public GitHub repository (repository name can be decided later).
2. Copy the contents of `campus-bus/` to the repository root.
3. Enable GitHub Pages from the new repository.
4. Replace the current preview workflow URLs that contain `Naoshi-Git/kon-lab` with the new repository Pages URL.
5. Keep `data/`, `src/`, `tests/`, `style.css`, `ui-v2.css`, and `ui-v3.css` together at the root using their current relative structure.
6. Run the Node tests before switching the public link.
7. After the standalone site is verified, keep the current Kon Lab PR only as migration history or remove its public entry point.

## Why the move is low-risk

- Application imports and assets use relative paths.
- No backend or repository-specific API is required at runtime.
- Timetable data is committed as static modules.
- Browser storage keys are independent of GitHub repository internals (the new origin will start with fresh localStorage, which is desirable for a clean public release).

## Items that need repository-specific adjustment

- GitHub Pages deployment/preview workflow URLs.
- The Kon Lab top-page link to the app.
- README links that currently point to the Kon Lab PR preview.

The connected GitHub integration used for development can edit and migrate files once the destination repository exists, but it does not currently expose repository creation itself. Therefore the only manual prerequisite is creating the empty public repository.
