# Color Presets Guide

Color presets come from the `settings [color]` collection and are written to `settings.color.palette` in your theme.json.

## Collection Setup

- Collection name: `settings [color]`
- Each variable in the collection becomes one palette entry
- Variable aliases are resolved to CSS variable references (not raw hex values)

## Output Format

```json
{
  "settings": {
    "color": {
      "palette": [
        {
          "slug": "primary-500",
          "name": "Primary 500",
          "color": "var(--token--color--primary-500)"
        },
        {
          "slug": "neutral-white",
          "name": "Neutral White",
          "color": "#ffffff"
        }
      ]
    }
  }
}
```

## Slug and Name Generation

The variable path is used directly:

- Slashes become hyphens for the slug: `primary/500` → `primary-500`
- Each segment is title-cased for the name: `primary/500` → `Primary 500`

## Alias Resolution

If a variable references another variable (alias), the referenced variable's collection determines the CSS var format:

| Referenced collection | Resolved to |
|----------------------|-------------|
| Starts with `!-usa` | `var(--token--{category}--{name})` |
| Starts with `!-theme` | `var(--{path--as--double-dashes})` |
| Anything else | `var(--wp--custom--{path})` |

Direct color values (not aliases) are converted to hex.
