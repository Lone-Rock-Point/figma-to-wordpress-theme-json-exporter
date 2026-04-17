# Fluid Variables Guide

This guide explains how to set up fluid (responsive) font sizes and spacing in the `settings [fluid]` collection.

## Overview

The `settings [fluid]` collection maps to two places in `theme.json`:

- Variables with `font` or `type` in the first path segment → `settings.typography.fontSizes`
- Variables with `spacing` or `space` in the first path segment → `settings.spacing.spacingSizes`

## Required Modes

The collection must have three modes named exactly:

| Mode name | Purpose |
|-----------|---------|
| `Desktop` | Maximum value (used as `size` and `fluid.max`) |
| `Mobile` | Minimum value (used as `fluid.min`) |
| `vw` | Viewport-width value for the spacing `min()` formula |

The `vw` mode is only used for spacing — typography only uses Desktop and Mobile.

## Font Sizes

For a variable named `font-size/xl` with Desktop=32 and Mobile=24:

```json
{
  "slug": "xl",
  "name": "Xl",
  "size": "32px",
  "fluid": {
    "min": "24px",
    "max": "32px"
  }
}
```

The slug comes from the last path segment. Only `FLOAT` variables are processed.

## Spacing Sizes

For a variable named `spacing/lg` with Desktop=32 and vw=3:

```json
{
  "slug": "lg",
  "name": "lg",
  "size": "min(2rem, 3vw)"
}
```

The formula is: `min({desktop ÷ 16}rem, {vw}vw)`

The 16 divisor assumes the root `html` font size is 16px. The name is preserved as-is from the last path segment (e.g. `.5`, `1`, `2`).

## Example Collection Structure

```
font-size/
  xs    Desktop: 14  Mobile: 12
  sm    Desktop: 16  Mobile: 14
  md    Desktop: 20  Mobile: 16
  lg    Desktop: 28  Mobile: 20
  xl    Desktop: 36  Mobile: 24

spacing/
  .5    Desktop: 4   vw: 0.5
  1     Desktop: 8   vw: 0.75
  2     Desktop: 16  vw: 1.5
  3     Desktop: 24  vw: 2.25
  4     Desktop: 32  vw: 3
```
