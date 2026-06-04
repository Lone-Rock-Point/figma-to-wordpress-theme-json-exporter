import { describe, it, expect } from 'vitest';
import {
	parseColor,
	parsePx,
	parseFluidSpacing,
	parseCustomValue,
	parseThemeJson,
} from './index';

// ─────────────────────────────────────────────────────────────────────────────
// parseColor
// ─────────────────────────────────────────────────────────────────────────────

describe('parseColor', () => {
	it('parses #rrggbb hex', () => {
		expect(parseColor('#ff0000')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
		expect(parseColor('#000000')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
		expect(parseColor('#ffffff')).toEqual({ r: 1, g: 1, b: 1, a: 1 });
	});

	it('parses #rrggbbaa hex with alpha', () => {
		const result = parseColor('#ff000080');
		expect(result).not.toBeNull();
		expect(result!.r).toBeCloseTo(1);
		expect(result!.g).toBeCloseTo(0);
		expect(result!.b).toBeCloseTo(0);
		expect(result!.a).toBeCloseTo(0.502, 2);
	});

	it('parses rgba()', () => {
		expect(parseColor('rgba(255, 0, 0, 0.5)')).toEqual({ r: 1, g: 0, b: 0, a: 0.5 });
		expect(parseColor('rgba(0, 128, 255, 1)')).toMatchObject({ g: expect.closeTo(0.502, 2) });
	});

	it('parses rgb()', () => {
		expect(parseColor('rgb(255, 255, 255)')).toEqual({ r: 1, g: 1, b: 1, a: 1 });
	});

	it('returns transparent for "transparent"', () => {
		expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
	});

	it('returns null for CSS var references', () => {
		expect(parseColor('var(--wp--preset--color--primary)')).toBeNull();
	});

	it('returns null for invalid values', () => {
		expect(parseColor('')).toBeNull();
		expect(parseColor('red')).toBeNull();
		expect(parseColor('not-a-color')).toBeNull();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// parsePx
// ─────────────────────────────────────────────────────────────────────────────

describe('parsePx', () => {
	it('strips px and returns number', () => {
		expect(parsePx('16px')).toBe(16);
		expect(parsePx('1.5px')).toBe(1.5);
		expect(parsePx('0px')).toBe(0);
	});

	it('returns null for non-px values', () => {
		expect(parsePx('1.5rem')).toBeNull();
		expect(parsePx('3vw')).toBeNull();
		expect(parsePx('bold')).toBeNull();
		expect(parsePx(undefined)).toBeNull();
		expect(parsePx('')).toBeNull();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// parseFluidSpacing
// ─────────────────────────────────────────────────────────────────────────────

describe('parseFluidSpacing', () => {
	it('parses min(Xrem, Yvw) syntax', () => {
		expect(parseFluidSpacing('min(1.5rem, 3vw)')).toEqual({ desktop: 24, vw: 3 });
		expect(parseFluidSpacing('min(2rem, 4vw)')).toEqual({ desktop: 32, vw: 4 });
	});

	it('rounds desktop value to 4 decimal places', () => {
		// 1rem * 16 = 16px, etc — check a less round number
		const result = parseFluidSpacing('min(0.625rem, 1.5vw)');
		expect(result).toEqual({ desktop: 10, vw: 1.5 });
	});

	it('returns null for non-fluid values', () => {
		expect(parseFluidSpacing('16px')).toBeNull();
		expect(parseFluidSpacing('1.5rem')).toBeNull();
		expect(parseFluidSpacing(undefined)).toBeNull();
		expect(parseFluidSpacing('')).toBeNull();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// parseCustomValue
// ─────────────────────────────────────────────────────────────────────────────

describe('parseCustomValue', () => {
	it('treats px strings as FLOAT', () => {
		expect(parseCustomValue('16px')).toEqual({ resolvedType: 'FLOAT', parsedValue: 16 });
		expect(parseCustomValue('1.5px')).toEqual({ resolvedType: 'FLOAT', parsedValue: 1.5 });
	});

	it('treats other strings as STRING', () => {
		expect(parseCustomValue('var(--wp--preset--color--primary)')).toEqual({
			resolvedType: 'STRING',
			parsedValue: 'var(--wp--preset--color--primary)',
		});
		expect(parseCustomValue('bold')).toEqual({ resolvedType: 'STRING', parsedValue: 'bold' });
		expect(parseCustomValue('#ff0000')).toEqual({ resolvedType: 'STRING', parsedValue: '#ff0000' });
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// parseThemeJson
// ─────────────────────────────────────────────────────────────────────────────

describe('parseThemeJson', () => {
	// --- Guard rails ---

	it('returns a warning for invalid input', () => {
		const { entries, warnings } = parseThemeJson(null);
		expect(entries).toHaveLength(0);
		expect(warnings.some(w => w.includes('Invalid'))).toBe(true);
	});

	it('warns when no importable sections found', () => {
		const { entries, warnings } = parseThemeJson({ $schema: '...', version: 3 });
		expect(entries).toHaveLength(0);
		expect(warnings.some(w => w.includes('No importable sections'))).toBe(true);
	});

	// --- settings [color] ---

	it('parses settings.color.palette into settings [color] entries', () => {
		const { entries, warnings } = parseThemeJson({
			settings: {
				color: {
					palette: [
						{ slug: 'primary', name: 'Primary', color: '#ff0000' },
						{ slug: 'secondary', name: 'Secondary', color: '#0000ff' },
					],
				},
			},
		});
		expect(warnings).toHaveLength(0);
		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({
			collection: 'settings [color]',
			variableName: 'palette/primary',
			resolvedType: 'COLOR',
			modes: { Default: { r: 1, g: 0, b: 0, a: 1 } },
		});
	});

	it('warns and skips unparseable color values', () => {
		const { entries, warnings } = parseThemeJson({
			settings: { color: { palette: [{ slug: 'x', color: 'red' }] } },
		});
		expect(entries).toHaveLength(0);
		expect(warnings.some(w => w.includes('Could not parse color'))).toBe(true);
	});

	it('warns and skips CSS var color references', () => {
		const { entries, warnings } = parseThemeJson({
			settings: { color: { palette: [{ slug: 'x', color: 'var(--wp--preset--color--primary)' }] } },
		});
		expect(entries).toHaveLength(0);
		expect(warnings.some(w => w.includes('CSS variable references'))).toBe(true);
	});

	// --- settings [fluid]: font sizes ---

	it('parses settings.typography.fontSizes with fluid values', () => {
		const { entries, warnings } = parseThemeJson({
			settings: {
				typography: {
					fontSizes: [
						{ slug: 'xl', name: 'XL', size: '36px', fluid: { min: '24px', max: '36px' } },
					],
				},
			},
		});
		expect(warnings).toHaveLength(0);
		expect(entries[0]).toMatchObject({
			collection: 'settings [fluid]',
			variableName: 'font-size/xl',
			resolvedType: 'FLOAT',
			modes: { Desktop: 36, Mobile: 24 },
		});
	});

	it('parses font size without fluid object using size as Desktop only', () => {
		const { entries } = parseThemeJson({
			settings: { typography: { fontSizes: [{ slug: 'sm', size: '14px' }] } },
		});
		expect(entries[0].modes).toEqual({ Desktop: 14 });
	});

	it('warns and skips font sizes with unparseable values', () => {
		const { entries, warnings } = parseThemeJson({
			settings: { typography: { fontSizes: [{ slug: 'x', size: 'clamp(1rem, 3vw, 2rem)' }] } },
		});
		expect(entries).toHaveLength(0);
		expect(warnings.some(w => w.includes('font size'))).toBe(true);
	});

	// --- settings [fluid]: spacing sizes ---

	it('parses settings.spacing.spacingSizes', () => {
		const { entries, warnings } = parseThemeJson({
			settings: {
				spacing: {
					spacingSizes: [
						{ slug: '4', name: '4', size: 'min(2rem, 4vw)' },
					],
				},
			},
		});
		expect(warnings).toHaveLength(0);
		expect(entries[0]).toMatchObject({
			collection: 'settings [fluid]',
			variableName: 'spacing/4',
			resolvedType: 'FLOAT',
			modes: { Desktop: 32, vw: 4 },
		});
	});

	it('warns and skips spacing sizes with unparseable values', () => {
		const { entries, warnings } = parseThemeJson({
			settings: { spacing: { spacingSizes: [{ slug: 'x', size: '16px' }] } },
		});
		expect(entries).toHaveLength(0);
		expect(warnings.some(w => w.includes('spacing size'))).toBe(true);
	});

	// --- settings [static] ---

	it('parses settings.border.radiusSizes', () => {
		const { entries } = parseThemeJson({
			settings: { border: { radiusSizes: [{ slug: 'sm', name: 'Small', size: '4px' }] } },
		});
		expect(entries[0]).toMatchObject({
			collection: 'settings [static]',
			variableName: 'border/radius-sizes/sm',
			resolvedType: 'FLOAT',
			modes: { Default: 4 },
		});
	});

	it('parses settings.dimensions.aspectRatios', () => {
		const { entries } = parseThemeJson({
			settings: { dimensions: { aspectRatios: [{ slug: '16-9', name: 'Wide', ratio: '16/9' }] } },
		});
		expect(entries[0]).toMatchObject({
			collection: 'settings [static]',
			variableName: 'dimensions/aspect-ratios/16-9',
			resolvedType: 'STRING',
			modes: { Default: '16/9' },
		});
	});

	it('parses settings.shadow.presets', () => {
		const { entries } = parseThemeJson({
			settings: { shadow: { presets: [{ slug: 'sm', name: 'Small', shadow: '0 1px 2px rgba(0,0,0,0.1)' }] } },
		});
		expect(entries[0]).toMatchObject({
			collection: 'settings [static]',
			variableName: 'shadow/presets/sm',
			resolvedType: 'STRING',
			modes: { Default: '0 1px 2px rgba(0,0,0,0.1)' },
		});
	});

	// --- settings [custom] ---

	it('flattens settings.custom into settings [custom] entries', () => {
		const { entries } = parseThemeJson({
			settings: {
				custom: {
					color: {
						link: { default: 'var(--wp--preset--color--primary)' },
					},
					spacing: { offset: '8px' },
				},
			},
		});
		expect(entries).toHaveLength(2);
		expect(entries.find(e => e.variableName === 'color/link/default')).toMatchObject({
			collection: 'settings [custom]',
			resolvedType: 'STRING',
			modes: { Default: 'var(--wp--preset--color--primary)' },
		});
		expect(entries.find(e => e.variableName === 'spacing/offset')).toMatchObject({
			collection: 'settings [custom]',
			resolvedType: 'FLOAT',
			modes: { Default: 8 },
		});
	});

	it('treats px strings in custom as FLOAT', () => {
		const { entries } = parseThemeJson({
			settings: { custom: { size: '24px' } },
		});
		expect(entries[0]).toMatchObject({ resolvedType: 'FLOAT', modes: { Default: 24 } });
	});

	it('warns and skips unsupported custom value types', () => {
		const { entries, warnings } = parseThemeJson({
			settings: { custom: { bad: [1, 2, 3] } },
		});
		expect(entries).toHaveLength(0);
		expect(warnings.some(w => w.includes('bad'))).toBe(true);
	});

	// --- styles ---

	it('flattens styles into styles entries', () => {
		const { entries } = parseThemeJson({
			styles: {
				elements: { link: { color: { text: 'var(--wp--preset--color--primary)' } } },
			},
		});
		expect(entries[0]).toMatchObject({
			collection: 'styles',
			variableName: 'elements/link/color/text',
			resolvedType: 'STRING',
			modes: { Default: 'var(--wp--preset--color--primary)' },
		});
	});

	// --- Combined ---

	it('handles a full theme.json with multiple sections', () => {
		const { entries, warnings } = parseThemeJson({
			$schema: 'https://schemas.wp.org/trunk/theme.json',
			version: 3,
			settings: {
				color: { palette: [{ slug: 'primary', color: '#ff0000' }] },
				typography: { fontSizes: [{ slug: 'xl', size: '36px', fluid: { min: '24px', max: '36px' } }] },
				spacing: { spacingSizes: [{ slug: '4', size: 'min(2rem, 4vw)' }] },
				border: { radiusSizes: [{ slug: 'sm', size: '4px' }] },
				custom: { gap: '16px' },
			},
			styles: { color: { text: 'var(--wp--preset--color--primary)' } },
		});
		expect(warnings).toHaveLength(0);
		expect(entries).toHaveLength(6);
		const collections = [...new Set(entries.map(e => e.collection))];
		expect(collections).toContain('settings [color]');
		expect(collections).toContain('settings [fluid]');
		expect(collections).toContain('settings [static]');
		expect(collections).toContain('settings [custom]');
		expect(collections).toContain('styles');
	});
});
