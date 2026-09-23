# whatsapp-web.js boundary

This directory is the compatibility boundary between the HTTP service and `whatsapp-web.js`.

- `privateInternals.js` is the only supported location for undocumented `whatsapp-web.js/src/*` imports and prototype patches.
- `legacy/` contains behavior-preserving implementations moved out of route-facing controllers. It may use `pupPage`, `pupBrowser`, or other wwebjs/Puppeteer implementation details while those paths are migrated behind narrower adapters.
- `src/controllers/**` must remain transport-oriented and may not reach into wwebjs private internals.
- `src/sessions.js` is a stable public facade over the session runtime in this boundary.

The deterministic architecture test enforces these constraints so a future wwebjs upgrade has one bounded compatibility surface to review.
