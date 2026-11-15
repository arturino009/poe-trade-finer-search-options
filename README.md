# Poe trade finer-search-options

Tampermonkey userscript for the official [Path of Exile trade site](https://www.pathofexile.com/trade) that lets you refine a search straight from the result list.

## Features

- **Per-mod buttons** – always shown on every mod of a listed item:
  - `+` (left, before the tier) adds that exact stat to your search filters
  - `−` (right) excludes that stat (adds it to a `NOT` group)
  - on a mod that is already in your filters, `−` removes it again (and `+` re-includes a `NOT`-ed mod)
- Mods already in your filters are highlighted (green = required, red = excluded).
- **Floating panel** (draggable, position is remembered) with quick ± buttons:
  - pseudo total life / cold / fire / lightning / chaos / elemental resistances / movement speed (min ±10)
  - "all res & life" in one click
  - buyout max price ±1
- Every change re-runs the search automatically.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the raw script: <https://raw.githubusercontent.com/arturino009/poe-trade-finer-search-options/main/poe-trade-finer-search-options.user.js>
3. Click **Install** (or **Reinstall/Update** if you already have the old Greasy Fork version – it will be replaced and will receive future updates from this repo).

## Changelog

- **2.1.0** – Per-mod `+`/`−` buttons are always visible (`+` before the tier on the left, `−` on the right); `−` on an already-filtered mod removes it from the filters.
- **2.0.0** – Rewritten for the current trade site (Vue 3 + separate results app). Talks to the site's Vuex store directly instead of walking Vue 2 components; no jQuery dependency; panel no longer injected into the Vue template; added chaos res, active-value display and remembered panel position. Updates now come from this repository.
- **1.1.8** – Last version of the original script by Maxime B on [Greasy Fork](https://greasyfork.org/scripts/398711-poe-trade-finer-search-options).

## Credits

Original script by **Maxime B** (MIT). Rewrite/maintenance by arturino009.
