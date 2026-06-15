# CivicPress Figma to WordPress theme.json Exporter

[![Support Level](https://img.shields.io/badge/support-beta-blueviolet.svg)](#support-level) [![MIT License](https://img.shields.io/github/license/10up/10up-block-theme-json-export.svg)](https://github.com/10up/figma-to-wordpress-theme-json-exporter/blob/develop/LICENSE.md)

> This Figma plugin exports named variable collections to the correct sections of a WordPress theme.json file, and imports theme.json values back into Figma as variables — keeping your design tokens and theme in sync.

This plugin is optimized for use with [CivicPress](https://civicpress.us/) — a WordPress block theme built for government and civic organizations. It works seamlessly with the [civicpress](https://github.com/Lone-Rock-Point/civicpress) and [civicpress-child](https://github.com/Lone-Rock-Point/civicpress-child) themes.

## How It Works

The plugin works in both directions:

- **Export** — reads six named variable collections from your Figma document and maps them to their corresponding locations in `theme.json`. Only the keys defined in Figma are updated; everything else in your existing `theme.json` is preserved.
- **Import** — reads a `theme.json` and syncs its color palette, typography, spacing, border, shadow, font families, custom color tokens, custom values, and styles back into Figma variable collections. Creates or updates variables as needed. CSS `var()` references are imported as Figma variable aliases pointing at the matching token.

| Collection name | theme.json source (import) / destination (export) |
|----------------|---------|
| `settings [color]` | `settings.color.palette` |
| `settings [fluid]` | `settings.typography.fontSizes` and `settings.spacing.spacingSizes` |
| `settings [static]` | `settings.border`, `settings.dimensions`, `settings.shadow`, `settings.typography.fontFamilies`, and other scalar settings |
| `settings [custom color]` | `settings.custom.color.*` |
| `settings [custom]` | `settings.custom.*` (excluding `color`) |
| `styles` | `styles.*` |

## Installation

1. Download the latest release zip from the [releases page](https://github.com/Lone-Rock-Point/figma-to-wordpress-theme-json-exporter/releases) and unzip it
2. Inside the unzipped folder, run:
   ```bash
   npm install
   npm run build
   ```
3. In Figma desktop, go to **Menu > Plugins > Development > Import plugin from manifest...**
4. Navigate to the unzipped folder and select `manifest.json`
5. The plugin will appear under **Menu > Plugins > Development** and is ready to use

> **Note:** Re-run `npm run build` and re-import the manifest whenever you update to a newer release.

## Usage

The plugin has two commands, both available under **Menu > Plugins > Development > WordPress Theme.json Export**.

### Export to theme.json

1. Go to **Menu > Plugins > Development > WordPress Theme.json Export > Export to theme.json**
2. Click **Choose File** and upload your existing `theme.json`
3. Click **Export Variables**
4. Preview the result and click **Download Theme Files**

### Import from theme.json

Import reads a `theme.json` and creates or updates the corresponding Figma variable collections. All major theme.json sections are supported: color palette, font sizes, spacing sizes, border radii, aspect ratios, shadow presets, font families, custom color tokens, custom values, and styles.

1. Go to **Menu > Plugins > Development > WordPress Theme.json Export > Import from theme.json**
2. Paste your `theme.json` content into the text area
3. Click **Preview Import** to see what will change before committing
4. Review the diff, then click **Import Variables** to apply

#### Import preview diff

The preview compares every incoming value against what's already in Figma and shows a status badge per variable:

| Badge | Meaning |
|-------|---------|
| **NEW** | Variable doesn't exist yet — will be created |
| **UPDATED** | Variable exists but value has changed — each mode shows `old → new` inline |
| **=** | Value is identical to what's in Figma — will be left untouched |
| **⚠** | Existing variable has a different type (e.g. COLOR vs FLOAT) — will be skipped |

The **Import Variables** button only appears when there is at least one NEW or UPDATED variable, and its label reflects the actionable count (e.g. `Import Variables (8 new, 3 updated)`).

Alias values in the preview are shown as `→ variable/path` (e.g. `→ palette/primary`) rather than the raw CSS var string, so you can see at a glance what each token will point to.

#### CSS variable references and alias resolution

When an entry's value is a CSS `var()` reference, the plugin tries to resolve it as a Figma variable alias. The resolution strategy depends on where the variable lives:

**Color palette (`settings [color]`)**
- If the target is found locally or in an enabled team library, it is linked as a `VARIABLE_ALIAS`.
- If the target cannot be resolved, the variable is **skipped** (no orphaned color swatch is created). A warning appears: *"Enable the library that contains this variable in your Figma file, then re-import."*

**All other collections (`settings [custom color]`, `settings [custom]`, `styles`, etc.)**
- WordPress-namespace refs (`var(--wp--...)`) that point to variables being created in the same import batch are deferred and resolved in a second pass after all variables have been written.
- External library refs (`var(--token--...)`, `var(--theme--...)`, etc.) that can't be resolved in the current file are handled gracefully: the variable is created with a safe default value so downstream aliases can reference it. A warning is emitted if the alias couldn't be set.

**`--theme--` references and `!-theme-tokens` stubs**

If your theme.json references design-system tokens via `var(--theme--...)` (e.g. font weights, type scales from a separate token library) and that library isn't connected to your Figma file, the plugin automatically creates a local **`!-theme-tokens`** collection with stub STRING variables for each referenced token. For example, `var(--theme--type--weight--bold)` produces a `!-theme-tokens/theme/type/weight/bold` variable with the value `"bold"`. This keeps the alias chain intact so your `settings [custom]` and `styles` variables can reference these stubs while you work. Connect the token library later and re-import to replace the stubs with live aliases.

> **Note:** To import USWDS token aliases, the USWDS variable library must be enabled in your Figma file via **Assets > Libraries**.

## Variable Collection Setup

### `settings [color]`

Each variable becomes a color palette entry. The slug and name come from the **last path segment only**. Variable aliases resolve to CSS variable references.

```
color-palette/primary-dark  →  { slug: "primary-dark", name: "Primary Dark", color: "var(--token--color--blue--70v)" }
color-palette/translucent   →  { slug: "translucent",   name: "Translucent",  color: "rgba(0, 0, 0, 0.6)" }
```

### `settings [fluid]`

Requires three modes: **Desktop**, **Mobile**, and **vw**.

- Variables whose first path segment contains `font` or `type` → `settings.typography.fontSizes`
  ```json
  { "slug": "xl", "name": "Xl", "size": "32px", "fluid": { "min": "24px", "max": "32px" } }
  ```
- Variables whose first path segment contains `spacing` or `space` → `settings.spacing.spacingSizes`
  ```json
  { "slug": "lg", "name": "lg", "size": "min(2rem, 3vw)" }
  ```
  The fluid spacing formula is `min({desktop/16}rem, {vw}vw)`.

### `settings [static]`

Scalar two-part variables (e.g. `layout/content-size`) map to `settings.layout.contentSize`.

Array variables use these exact paths:

| Figma path prefix | Maps to | Value key |
|-------------------|---------|-----------|
| `border/radius-sizes/{slug}` | `settings.border.radiusSizes` | `size` |
| `dimensions/aspect-ratios/{slug}` | `settings.dimensions.aspectRatios` | `ratio` |
| `shadow/presets/{slug}` | `settings.shadow.presets` | `shadow` |
| `typography/fontFamilies/{slug}` | `settings.typography.fontFamilies` | `fontFamily` |

Aspect ratio slugs are written with hyphens (`16-9`) and values as fractions (`16/9`). Common ratios get human-readable names automatically (Wide, Square, Standard, etc.).

Font family variables store only the primary font name (e.g. `"Montserrat"`, not `"Montserrat, sans-serif"`). On import, the full CSS font-family stack from `theme.json` is stripped to just the first name.

### `settings [custom color]`

Variables under `settings.custom.color` in `theme.json` are imported here as COLOR variables. Variable path becomes the key path prefixed with `custom/color/`:

```
custom/color/warning         →  settings.custom.color.warning
custom/color/link/default    →  settings.custom.color.link.default
```

Hex colors, `rgb()`, and CSS `var()` color references are all supported.

### `settings [custom]`

All other values under `settings.custom` (excluding `color`) are imported here as STRING or FLOAT variables. Variable path becomes the key path under `settings.custom`:

```
body/typography/fontWeight  →  settings.custom.body.typography.fontWeight
spacing/offset              →  settings.custom.spacing.offset
```

Aliases to `!-usa/` collections resolve to `var(--token--category--name)`.  
Aliases to `!-theme-tokens/` collections resolve to `var(--theme--path)`.

### `styles`

Variable path becomes the key path under `styles`. For example:

```
elements/link/:hover/color/text  →  styles.elements.link.:hover.color.text
```

## Variable Reference Resolution

| Alias collection prefix | Resolved to |
|------------------------|-------------|
| `!-usa/color/blue/5v` | `var(--token--color--blue-5v)` |
| `!-theme-tokens/theme/color/accent` | `var(--theme--color--accent)` |
| `settings [color]/palette/{slug}` | `var(--wp--preset--color--{slug})` |
| `settings [static]/typography/fontFamilies/{slug}` | `var(--wp--preset--font-family--{slug})` |
| `settings [fluid]/font-size/{slug}` | `var(--wp--preset--font-size--{slug})` |
| `settings [custom]/*` | `var(--wp--custom--path--to--var)` |
| `settings [custom color]/*` | `var(--wp--custom--color--path)` |

## Plugin Interface

**Export panel**
- **Resizable**: Drag the bottom-right corner to resize
- **File preview**: Syntax-highlighted output with copy button
- **Download**: Single file or zip for multiple files

**Import panel**
- **Resizable**: Drag the bottom-right corner to resize
- **Diff preview**: Color-coded status badges (NEW / UPDATED / = / ⚠) with inline old→new comparison for changed values; alias targets shown as `→ variable/path`
- **Actionable import button**: Only appears when there are variables to create or update; label shows the count

## Development

```bash
npm install
npm run watch   # watch mode
npm run build   # production build
```

## Support Level

**Beta:** Bug reports, feature requests, and pull requests are welcome. Use with caution in production.
