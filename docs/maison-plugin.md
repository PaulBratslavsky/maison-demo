# The Maison plugin in this repo

`strapi/src/plugins/maison` is [strapi-store-demo-mcp](https://github.com/PaulBratslavsky/strapi-store-demo-mcp) at `27fb8a6` (branch `feat/maison-inquiries`), unchanged. That repo holds the original, so change Maison there first. The demo doesn't change Maison: it only configures it, in `strapi/config/plugins.ts`.

The plugin's own README (`strapi/src/plugins/maison/README.md`) documents its tools, routes, permissions and admin pages.

## How the plugin shares Strapi's packages

Two settings keep one copy of Strapi's packages:

- **One Strapi version.** `strapi/package.json` holds eight `@strapi` packages at 5.55.1 with `overrides`. Without them, npm resolves Strapi's own `^5.0.0` peer ranges to a newer release, and a second copy of `@strapi/utils` turns Maison's 400s into 500s. (oauth-mcp-manager 1.1.0 never loads `@strapi/utils`.)
- **Maison shares Strapi's `@strapi/utils`.** Maison is a local plugin with its own dependencies, so its build would load its own copy. `strapi/scripts/share-strapi-utils.mjs` removes that copy after the build, on every `npm install` in `strapi/`, and `npm test` checks it.

## Update the copy

To bring in a newer version from a local clone of the plugin's repo, stop Strapi first (the install rebuilds Maison while it runs), then:

```bash
SRC=../plugin-dev/plugins/strapi-store-demo-mcp   # your clone, or its inquiries worktree
SHA=$(git -C "$SRC" rev-parse --verify feat/maison-inquiries)
FILES=(admin server test scripts package.json package-lock.json README.md CHANGELOG.md vitest.config.ts vitest.live.config.ts .gitignore .editorconfig .prettierrc .prettierignore)
test -n "$SHA" && rm -rf strapi/src/plugins/maison && mkdir strapi/src/plugins/maison
git -C "$SRC" archive "$SHA" -- "${FILES[@]}" | tar -x -C strapi/src/plugins/maison
npm install --prefix strapi   # installs and builds it, and shares @strapi/utils
git add strapi/src/plugins/maison
test -n "$SHA" && diff <(git -C "$SRC" ls-tree -r "$SHA" -- "${FILES[@]}" | awk '{print $3, $4}' | sort -k2) \
     <(git ls-files -s strapi/src/plugins/maison | awk '{sub("strapi/src/plugins/maison/", "", $4); print $2, $4}' | sort -k2) \
  && echo "The staged copy matches $SHA"
```

- **The check compares what git tracks,** file by file, with the plugin's commit, not the folder. `strapi/.gitignore`'s patterns apply inside the copy too, so a file on disk may not be tracked.
- **If `SRC` is wrong,** `SHA` stays empty: nothing is deleted, and the check prints nothing. Without "The staged copy matches", the copy doesn't match.
- **Copy `feat/maison-inquiries`,** the branch of the plugin's inquiries worktree (`strapi-store-demo-mcp-inquiries`). It holds product knowledge, customer questions and inquiries. `feat/maison-plugin` and `feat/maison-follow-up` are older, and a copy of either loses features. The worktree and the clone are one repository, so either works as `SRC`.
- Commit with the SHA in the message, update the commit named at the top of this page, and start Strapi.

## Work on the plugin in place

- Run `npm run watch` in the plugin's folder, and restart Strapi to load each rebuild.
- If you run `npm install` in the plugin's folder, stop Strapi and run `npm install --prefix strapi` afterwards. Until then, `npm run dev:strapi` refuses to start: the `predevelop` check finds Maison's own `@strapi/utils`.
