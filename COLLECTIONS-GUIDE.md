# Collections Guide

This guide documents how each Figma variable collection maps to WordPress `theme.json`.

The plugin reads six specifically-named collections. Collection names are matched case-insensitively with whitespace trimmed. Collections with other names are ignored.

---

## `settings [color]`

**Maps to:** `settings.color.palette`

Each variable becomes one palette entry. The entire palette array is replaced on export.

**Variable path → output:**
- Path segments become the slug (joined with hyphens, lowercased) and the name (each segment title-cased)
- Alias variables resolve to CSS variable references
- Direct `COLOR` values convert to hex
- Direct `STRING` values are used as-is

**Example:**

| Variable | Slug | Name | Color |
|----------|------|------|-------|
| `primary/500` | `primary-500` | `Primary 500` | `var(--token--color--primary-500)` |
| `neutral/white` | `neutral-white` | `Neutral White` | `#ffffff` |

**Output:**
```json
{
  "settings": {
    "color": {
      "palette": [
        { "slug": "primary-500", "name": "Primary 500", "color": "var(--token--color--primary-500)" },
        { "slug": "neutral-white", "name": "Neutral White", "color": "#ffffff" }
      ]
    }
  }
}
```

---

## `settings [fluid]`

**Maps to:** `settings.typography.fontSizes` and `settings.spacing.spacingSizes`

Requires three modes named exactly **Desktop**, **Mobile**, and **vw**. Only `FLOAT` type variables are processed.

The first path segment determines where the variable goes:
- Contains `font` or `type` → `fontSizes`
- Contains `spacing` or `space` → `spacingSizes`

### Font sizes

Uses Desktop and Mobile modes. The slug and name come from the last path segment.

```json
{
  "slug": "xl",
  "name": "Xl",
  "size": "36px",
  "fluid": { "min": "24px", "max": "36px" }
}
```

- `size` = Desktop value in px
- `fluid.max` = Desktop value in px
- `fluid.min` = Mobile value in px

### Spacing sizes

Uses Desktop and vw modes (Mobile is ignored for spacing). The slug and name come from the last path segment, preserved as-is.

```json
{
  "slug": "4",
  "name": "4",
  "size": "min(2rem, 3vw)"
}
```

Formula: `min({desktop ÷ 16}rem, {vw}vw)`

The 16 divisor assumes a 16px root font size.

**Example collection structure:**
```
font-size/xs   Desktop: 14  Mobile: 12
font-size/sm   Desktop: 16  Mobile: 14
font-size/xl   Desktop: 36  Mobile: 24

spacing/1      Desktop: 8   vw: 0.75
spacing/2      Desktop: 16  vw: 1.5
spacing/4      Desktop: 32  vw: 3
```

---

## `settings [static]`

**Maps to:** `settings.border`, `settings.dimensions`, `settings.shadow`, and other scalar settings

Uses the first mode. Variables use a two-level path: `category/property`.

### Scalar variables (two path segments)

`category/property` → `settings.{camelCaseCategory}.{camelCaseProperty}`

- `FLOAT` values → appended with `px`
- `STRING` values → used as-is
- Aliases → resolved to CSS variable references

Skipped automatically: `layout/navigation-size`, any `typography/*` variables.

**Examples:**
```
layout/content-size  →  settings.layout.contentSize: "1200px"
layout/wide-size     →  settings.layout.wideSize: "1400px"
border/style         →  settings.border.style: "solid"
```

### Array variables (three+ path segments)

Three prefixes are recognized:

| Prefix | Maps to | Value key |
|--------|---------|-----------|
| `border/radius-sizes/{slug}` | `settings.border.radiusSizes` | `size` |
| `dimensions/aspect-ratios/{slug}` | `settings.dimensions.aspectRatios` | `ratio` |
| `shadow/presets/{slug}` | `settings.shadow.presets` | `shadow` |

For `border/radius-sizes`, `FLOAT` values are formatted as `{n}px`.

For `dimensions/aspect-ratios`, common slugs get human-readable names:

| Slug | Name |
|------|------|
| `1` or `1-1` | Square |
| `4-3` | Standard |
| `3-4` | Portrait |
| `16-9` | Wide |
| `9-16` | Tall |
| `3-2` | Photo |
| `2-3` | Portrait Photo |
| `21-9` | Ultrawide |

**Example output:**
```json
{
  "settings": {
    "border": {
      "radiusSizes": [
        { "slug": "sm", "name": "Sm", "size": "4px" },
        { "slug": "md", "name": "Md", "size": "8px" }
      ]
    },
    "dimensions": {
      "aspectRatios": [
        { "slug": "16-9", "name": "Wide", "ratio": "16/9" },
        { "slug": "4-3", "name": "Standard", "ratio": "4/3" }
      ]
    }
  }
}
```

---

## `settings [custom color]`

**Maps to:** `settings.custom.*`

Works identically to `settings [custom]` (see below). Use this collection for color-type custom variables to keep them organized separately in Figma.

---

## `settings [custom]`

**Maps to:** `settings.custom.*`

Each variable's path becomes the nested key path under `settings.custom`. Uses the first mode.

- `COLOR` values → hex string
- `FLOAT` values → number
- `STRING` values → string
- Aliases → resolved to CSS variable references

**Example:**
```
color/link/default        →  settings.custom.color.link.default
typography/body/font-size →  settings.custom.typography.body.font-size
```

**Alias resolution:**

| Referenced collection starts with | Resolves to |
|----------------------------------|-------------|
| `!-usa` | `var(--token--{category}--{rest-joined-with-hyphens})` |
| `!-theme` | `var(--{path/as/double-dashes})` |
| Anything else | `var(--wp--custom--{path})` |

---

## `styles`

**Maps to:** `styles.*`

Each variable's path becomes the nested key path under `styles`. Uses the first mode. Resolution works the same as `settings [custom]`.

Use path segments that match the WordPress styles structure. Pseudo-selectors like `:hover` and `:focus` are valid path segments.

**Example:**
```
elements/link/color/text         →  styles.elements.link.color.text
elements/link/:hover/color/text  →  styles.elements.link.:hover.color.text
blocks/core/button/color/text    →  styles.blocks.core/button.color.text
```

**Example output:**
```json
{
  "styles": {
    "elements": {
      "link": {
        "color": { "text": "var(--theme--color--link)" },
        ":hover": {
          "color": { "text": "var(--theme--color--link-hover)" }
        }
      }
    }
  }
}
```
