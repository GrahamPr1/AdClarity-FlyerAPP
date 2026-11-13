# Enterprise accounts get no stock photos while Unsplash is disabled

**Status:** open — to be decided. Recorded 2026-11-13.

Enterprise org accounts and NOP agents are allowed **Unsplash only**: Pixabay
and Pexels are public-only by an explicit check (`extraStockAllowedFor` in
`lib/stock-photos.ts`). The Unsplash app (1061998) is disabled and its key
answers HTTP 401, so these accounts currently get no stock photo at all —
their flyers use the no-photo layout (or a client-supplied photo).

Left this way on purpose until it's decided whether their orgs approve
Pixabay (or another source). Nothing changes for them until then; the agent
regression keeps their output byte-identical.
