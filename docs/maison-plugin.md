# The Maison plugin in this repo

`strapi/src/plugins/maison` is the Maison plugin, and this repo is its home: change Maison here. It started in a separate repo, [strapi-store-demo-mcp](https://github.com/PaulBratslavsky/strapi-store-demo-mcp), which is no longer updated. The demo loads it as a local plugin, from `strapi/config/plugins.ts` (`resolve: 'src/plugins/maison'`), and configures it there.

The plugin's own README (`strapi/src/plugins/maison/README.md`) documents its tools, routes, permissions and admin pages.

## How the plugin shares Strapi's packages

Two settings keep one copy of Strapi's packages:

- **One Strapi version.** `strapi/package.json` holds eight `@strapi` packages at 5.55.1 with `overrides`. Without them, npm resolves Strapi's own `^5.0.0` peer ranges to a newer release, and a second copy of `@strapi/utils` turns Maison's 400s into 500s. (oauth-mcp-manager 1.1.0 never loads `@strapi/utils`.)
- **Maison shares Strapi's `@strapi/utils`.** Maison is a local plugin with its own dependencies, so its build would load its own copy. `strapi/scripts/share-strapi-utils.mjs` removes that copy after the build, on every `npm install` in `strapi/`, and `npm test` checks it.

## Work on the plugin in place

- Run `npm run watch` in the plugin's folder, and restart Strapi to load each rebuild.
- If you run `npm install` in the plugin's folder, stop Strapi and run `npm install --prefix strapi` afterwards. Until then, `npm run dev:strapi` refuses to start: the `predevelop` check finds Maison's own `@strapi/utils`.
