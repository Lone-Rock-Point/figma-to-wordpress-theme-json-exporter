# Installation Guide

## Installing the Plugin

### From Figma Community

1. Open Figma and navigate to the Community tab
2. Search for "WordPress Theme.json Export"
3. Click **Install**

### Manual Installation (Development)

1. Clone or download the repository
2. Run `npm install` then `npm run build`
3. In Figma, go to **Menu > Plugins > Development > Import plugin from manifest**
4. Select the `manifest.json` file

## Setting Up Your Figma Document

The plugin reads six specifically-named variable collections. Collection names are case-insensitive and must match exactly (extra whitespace is ignored).

### Required Collection Names

| Collection name | Purpose |
|----------------|---------|
| `settings [color]` | Color palette entries |
| `settings [fluid]` | Fluid font sizes and spacing sizes |
| `settings [static]` | Border, dimensions, shadow, and other scalar settings |
| `settings [custom color]` | Custom CSS variables (color values) |
| `settings [custom]` | Custom CSS variables (any type) |
| `styles` | theme.json styles section |

Collections with other names are ignored.

### `settings [color]`

- Each variable becomes a `settings.color.palette` entry
- Variable path becomes the slug (slashes → hyphens) and display name
- Aliases are resolved to CSS variable references

### `settings [fluid]`

Requires three modes named exactly **Desktop**, **Mobile**, and **vw**:

- Variables whose first path segment contains `font` or `type` → `settings.typography.fontSizes`
  - Desktop value = `size` and `fluid.max`
  - Mobile value = `fluid.min`
- Variables whose first path segment contains `spacing` or `space` → `settings.spacing.spacingSizes`
  - Size formula: `min({desktop/16}rem, {vw}vw)`

Only `FLOAT` type variables are processed in this collection.

### `settings [static]`

Use a two-level naming convention: `category/property`.

**Scalar examples:**
- `layout/content-size` → `settings.layout.contentSize`
- `layout/wide-size` → `settings.layout.wideSize`

**Array items** use three levels: `category/group/slug`:
- `border/radius-sizes/sm` → `settings.border.radiusSizes` entry with slug `sm`
- `dimensions/aspect-ratios/16-9` → `settings.dimensions.aspectRatios` entry with slug `16-9`, ratio value `16/9`
- `shadow/presets/card` → `settings.shadow.presets` entry with slug `card`

Skipped automatically: `layout/navigation-size`, any `typography/*` variables.

### `settings [custom color]` and `settings [custom]`

Variable path (using `/` as separator) becomes the nested key path under `settings.custom`.

### `styles`

Variable path becomes the nested key path under `styles`. Use `:hover`, `:focus`, etc. as path segments for pseudo-selectors.

## Variable Alias Resolution

Aliases pointing to other Figma collections are resolved to CSS custom property references:

| Referenced collection starts with | Resolved format |
|----------------------------------|-----------------|
| `!-usa` | `var(--token--{category}--{name})` |
| `!-theme` | `var(--{path/as/double-dashes})` |
| Anything else | `var(--wp--custom--{path})` |

## Exporting

1. Go to **Menu > Plugins > WordPress Theme.json Export > Export to theme.json**
2. Click **Choose File** and select your existing `theme.json`
3. Click **Export Variables**
4. Preview the output and click **Download Theme Files**

## Using the Generated Files in WordPress

1. Extract the downloaded zip (if applicable)
2. Copy `theme.json` to the root of your WordPress theme
3. Copy the `styles/` folder (if present) to the root of your theme

## Troubleshooting

- **Variables not exporting** — Make sure the collection name matches exactly and variables are published
- **Alias not resolving** — Confirm the referenced collection name starts with `!-usa` or `!-theme` as appropriate
- **Base theme not loading** — Ensure your theme.json is valid JSON

For more help, open an issue on GitHub.
