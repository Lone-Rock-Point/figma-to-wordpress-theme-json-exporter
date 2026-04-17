# Spacing Guide

Spacing presets come from the `settings [fluid]` collection. See [FLUID-VARIABLES-GUIDE.md](FLUID-VARIABLES-GUIDE.md) for full setup instructions.

## Quick Reference

- Collection name: `settings [fluid]`
- Variable first path segment must contain `spacing` or `space`
- Requires three modes: **Desktop**, **Mobile** (unused for spacing), and **vw**
- Output: `settings.spacing.spacingSizes`

## Output Format

```json
{
  "settings": {
    "spacing": {
      "spacingSizes": [
        { "slug": "1", "name": "1", "size": "min(0.5rem, 0.75vw)" },
        { "slug": "2", "name": "2", "size": "min(1rem, 1.5vw)" },
        { "slug": "4", "name": "4", "size": "min(2rem, 3vw)" }
      ]
    }
  }
}
```

## Size Formula

```
min({desktopValue ÷ 16}rem, {vwValue}vw)
```

The slug and name both come from the last segment of the variable path.
