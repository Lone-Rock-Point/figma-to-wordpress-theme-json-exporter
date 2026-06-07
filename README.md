# CivicPress Figma to WordPress theme.json Exporter

[![Support Level](https://img.shields.io/badge/support-beta-blueviolet.svg)](#support-level) [![MIT License](https://img.shields.io/github/license/10up/10up-block-theme-json-export.svg)](https://github.com/10up/figma-to-wordpress-theme-json-exporter/blob/develop/LICENSE.md)

> This Figma plugin exports named variable collections to the correct sections of a WordPress theme.json file, and imports theme.json color palettes back into Figma as variables — keeping your design tokens and theme in sync.

This plugin is optimized for use with [CivicPress](https://civicpress.us/) — a WordPress block theme built for government and civic organizations. It works seamlessly with the [civicpress](https://github.com/Lone-Rock-Point/civicpress) and [civicpress-child](https://github.com/Lone-Rock-Point/civicpress-child) themes.

## How It Works

The plugin works in both directions:

- **Export** — reads six named variable collections from your Figma document and maps them to their corresponding locations in `theme.json`. Only the keys defined in Figma are updated; everything else in your existing `theme.json` is preserved.
- **Import** — reads a `theme.json` and syncs its color palette and custom values back into Figma variable collections, creating or updating variables as needed. CSS `var()` references are imported as Figma variable aliases pointing at the matching token.

| Collection name | Maps to |
|----------------|---------|
| `settings [color]` | `settings.color.palette` |
| `settings [fluid]` | `settings.typography.fontSizes` and `settings.spacing.spacingSizes` |
| `settings [static]` | `settings.border`, `settings.dimensions`, `settings.shadow`, and other scalar settings |
| `settings [custom color]` | `settings.custom.*` |
| `settings [custom]` | `settings.custom.*` |
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

The plugin has two commands, both available under **Menu > Plugins > WordPress Theme.json Export**.

### Export to theme.json

1. Go to **Menu > Plugins > WordPress Theme.json Export > Export to theme.json**
2. Click **Choose File** and upload your existing `theme.json`
3. Click **Export Variables**
4. Preview the result and click **Download Theme Files**

### Import from theme.json

Import reads a `theme.json` and syncs its color palette and custom values back into Figma variable collections, creating or updating variables as needed.

1. Go to **Menu > Plugins > WordPress Theme.json Export > Import from theme.json**
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

#### CSS variable references and USWDS aliases

Color palette entries whose value is a CSS `var()` reference (e.g. `"color": "var(--token--color--orange-50v)"`) are imported as Figma **variable aliases** rather than hard-coded colors. The plugin searches both local collections and connected team libraries to resolve the alias target.

- If the target variable is found locally or in an enabled team library it is linked as a `VARIABLE_ALIAS`.
- If the library containing the target variable is not enabled in the current Figma file, the variable is skipped with a warning: *"Enable the library that contains this variable in your Figma file, then re-import."*

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

Aspect ratio slugs are written with hyphens (`16-9`) and values as fractions (`16/9`). Common ratios get human-readable names automatically (Wide, Square, Standard, etc.).

### `settings [custom color]` and `settings [custom]`

Variable path becomes the key path under `settings.custom`. For example:

```
color/link/default  →  settings.custom.color.link.default
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
| Any other collection | `var(--wp--custom--path--to--var)` |

## Plugin Interface

**Export panel**
- **Resizable**: Drag the bottom-right corner to resize
- **File preview**: Syntax-highlighted output with copy button
- **Download**: Single file or zip for multiple files

**Import panel**
- **Resizable**: Drag the bottom-right corner to resize
- **Diff preview**: Color-coded status badges (NEW / UPDATED / = / ⚠) with inline old→new comparison for changed values
- **Actionable import button**: Only enabled when there are variables to create or update; label shows the count

## Development

```bash
npm install
npm run watch   # watch mode
npm run build   # production build
```

## Support Level

**Beta:** Bug reports, feature requests, and pull requests are welcome. Use with caution in production.
