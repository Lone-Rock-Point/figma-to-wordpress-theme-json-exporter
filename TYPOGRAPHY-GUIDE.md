# Typography Guide

Font size presets come from the `settings [fluid]` collection. See [FLUID-VARIABLES-GUIDE.md](FLUID-VARIABLES-GUIDE.md) for full setup instructions.

## Quick Reference

- Collection name: `settings [fluid]`
- Variable first path segment must contain `font` or `type`
- Requires three modes: **Desktop**, **Mobile**, and **vw** (vw unused for typography)
- Output: `settings.typography.fontSizes`

## Output Format

```json
{
  "settings": {
    "typography": {
      "fontSizes": [
        {
          "slug": "sm",
          "name": "Sm",
          "size": "16px",
          "fluid": { "min": "14px", "max": "16px" }
        },
        {
          "slug": "xl",
          "name": "Xl",
          "size": "36px",
          "fluid": { "min": "24px", "max": "36px" }
        }
      ]
    }
  }
}
```

- `size` and `fluid.max` come from the **Desktop** mode value
- `fluid.min` comes from the **Mobile** mode value
- The slug is the last path segment (lowercased)
- The name is the last path segment (title-cased)
