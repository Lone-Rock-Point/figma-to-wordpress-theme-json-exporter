# CivicPress Figma to WordPress theme.json Exporter

[![Support Level](https://img.shields.io/badge/support-beta-blueviolet.svg)](#support-level) [![MIT License](https://img.shields.io/github/license/10up/10up-block-theme-json-export.svg)](https://github.com/10up/figma-to-wordpress-theme-json-exporter/blob/develop/LICENSE.md)

> This Figma plugin exports named variable collections to the correct sections of a WordPress theme.json file, merging into your existing theme rather than overwriting it.

This plugin is optimized for use with [CivicPress](https://civicpress.us/) — a WordPress block theme built for government and civic organizations. It works seamlessly with the [civicpress](https://github.com/Lone-Rock-Point/civicpress) and [civicpress-child](https://github.com/Lone-Rock-Point/civicpress-child) themes.

## How It Works

The plugin reads six named variable collections from your Figma document and maps them directly to their corresponding locations in `theme.json`. Only the keys defined in Figma are updated — everything else in your existing theme.json is preserved.

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

1. Go to **Menu > Plugins > WordPress Theme.json Export > Export to theme.json**
2. Click **Choose File** and upload your existing `theme.json`
3. Click **Export Variables**
4. Preview the result and click **Download Theme Files**

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

- **Resizable**: Drag the bottom-right corner to resize
- **File preview**: Syntax-highlighted output with copy button
- **Download**: Single file or zip for multiple files

## Development

```bash
npm install
npm run watch   # watch mode
npm run build   # production build
```

## Support Level

**Beta:** Bug reports, feature requests, and pull requests are welcome. Use with caution in production.
