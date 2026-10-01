# Changelog

## Unreleased

### Added

- **A "Maison requests" widget on the admin Homepage** (`plugin::maison.requests`), for admins with "MCP: review appointment requests". It counts one pipeline of visits still ahead (the requests waiting for staff, the confirmed visits, and how many of those have had their LINE confirmation sent), lists the five newest requests, and refreshes every 5 seconds.
  - `GET /maison/appointments/summary`, an admin route gated on the same permission as the board's list. It answers `{ counts, recent }` from the new `appointments.summarizeRequests()`, which counts with the board's own definitions and returns the board's "All requests" rows, masked the same way.
- **REST routes at `/api/maison`**, on the same services, input schemas and LINE customer identity as the MCP tools:
  - `GET /collections`, `GET /products`, `GET /products/:slug` and `GET /boutiques`, as `browse_collections`, `search_products`, `view_product` and `find_boutiques`. Their actions are `plugin::maison.collections.find`, `products.find`, `products.findOne` and `boutiques.find`. Grant them to a role such as Public, or call with a read-only, full-access or custom API token.
  - `POST /appointments` and `GET /my-appointments`, as `request_appointment` and `my_appointments`, for the signed-in LINE customer only. A new `customer-session` policy runs `/mcp`'s session check (oauth-mcp-manager's `resolveAccessToken`), then resolves the customer the way the tools do (`resolveSubject`). It answers 401 with `WWW-Authenticate: Bearer` when that check refuses the session or no LINE customer holds it, 503 `not_configured` without oauth-mcp-manager 1.1, and 503 `temporarily_unavailable` when checking the session fails on the server.
  - `/mcp` goes further in two ways. Strapi core also refuses a session whose admin token has expired (`checkExpiry`), which the REST door accepts until the session itself expires, at most the session TTL of 1 hour. And each tool needs its own permission on that admin token, which the REST door doesn't check. Closing the first gap belongs in oauth-mcp-manager (`resolveAccessToken` refusing an expired admin token), in a later release.
  - Errors as `{ "error": { "code", "message", "hint" } }`, with the tools' codes, messages and hints, and statuses 400, 401, 404, 409, 422 and 503. One code is the REST door's own: `temporarily_unavailable`.
- `createdVia: "web"` for visits requested through the REST routes. The requests board, `appointment_requests` and `confirm_appointment` show it.
- `identity.customerSession(authorization)`: the customer behind an `Authorization` header, for the MCP tools and the REST routes alike. It always runs `/mcp`'s session check first. Only the MCP tools skip that step, inside the service, because `/mcp` has already run it on their request.

### Changed

- `request_appointment` takes an optional `locale` (`ja` or `en`), like the other customer tools, and names the boutique and products in its answer in that language. Until now it always answered in `defaultLocale`, which is still the default. The booking body of `POST /api/maison/appointments` takes it too.
- The customer tools' input schemas live in `server/src/mcp/schemas.ts`, shared with the REST routes. Apart from `request_appointment`'s `locale`, the tools' inputs, outputs and errors are unchanged.
- A failed customer lookup is logged without oauth-mcp-manager's error message, which could quote the token.
