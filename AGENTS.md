# Releasing

Only when asked ("release X"). Every release gets a tag and a GitHub release
(since 0.8.5; earlier versions have none).

1. Feature commits already made; `git status` clean apart from the release.
2. `mise exec -- npm version X --no-git-tag-version`
3. CHANGELOG: rename `## Unreleased` to `## X — YYYY-MM-DD`.
4. Commit only `CHANGELOG.md package.json package-lock.json` as
   `Release X: <what's in it>`, then check `git show --stat`.
5. `git push origin main`
6. GitHub release, which creates the tag on the release commit. `--target` must
   be the full SHA (a short one is rejected):
   ```sh
   awk -v v="X" '/^## /{p = ($2 == v)} p && !/^## /' CHANGELOG.md | sed -e '/./,$!d' > tmp/notes.md
   gh release create vX -R varyform/re-rebirth --target <full sha of HEAD> \
     --title "X — <short summary>" --notes-file tmp/notes.md --latest
   rm tmp/notes.md && git fetch --tags
   ```
7. Deploy: `mise exec -- kamal deploy`.
8. Check that the served bundle (`assets/index-*.js` on https://rb.varyform.info)
   contains the version.
