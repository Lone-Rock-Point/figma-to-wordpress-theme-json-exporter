import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockFigma } from '../test-setup';
import {
	parseColor,
	parseColorOrAlias,
	parsePx,
	parseFluidSpacing,
	parseCustomValue,
	parseThemeJson,
	writeImportEntries,
	cssVarToDisplayName,
	type ImportEntry,
	type VarAliasRef,
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
// parseColorOrAlias
// ─────────────────────────────────────────────────────────────────────────────

describe('parseColorOrAlias', () => {
	it('returns a FigmaColor for concrete hex, rgb, and transparent values', () => {
		expect(parseColorOrAlias('#ff0000')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
		expect(parseColorOrAlias('rgb(0, 255, 0)')).toEqual({ r: 0, g: 1, b: 0, a: 1 });
		expect(parseColorOrAlias('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
	});

	it('returns a VarAliasRef for USWDS token var references', () => {
		expect(parseColorOrAlias('var(--token--color--orange-50v)')).toEqual<VarAliasRef>({
			type: 'VAR_ALIAS',
			cssVar: 'var(--token--color--orange-50v)',
		});
	});

	it('returns a VarAliasRef for any CSS var reference', () => {
		expect(parseColorOrAlias('var(--wp--preset--color--primary)')).toEqual<VarAliasRef>({
			type: 'VAR_ALIAS',
			cssVar: 'var(--wp--preset--color--primary)',
		});
	});

	it('returns null for unparseable values', () => {
		expect(parseColorOrAlias('red')).toBeNull();
		expect(parseColorOrAlias('')).toBeNull();
		expect(parseColorOrAlias(undefined)).toBeNull();
	});

	it('trims whitespace before matching var( or color', () => {
		expect(parseColorOrAlias('  var(--token--color--blue-40v)  ')).toEqual<VarAliasRef>({
			type: 'VAR_ALIAS',
			cssVar: 'var(--token--color--blue-40v)',
		});
		expect(parseColorOrAlias('  #ff0000  ')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
	});

	it('clamps out-of-range rgb components to [0, 1]', () => {
		// rgb(300, 0, 0) would overflow without clamping
		const result = parseColorOrAlias('rgb(300, 0, 0)');
		expect(result).not.toBeNull();
		expect((result as any).r).toBe(1);
		expect((result as any).g).toBe(0);
		expect((result as any).b).toBe(0);
		// alpha > 1 clamped
		const withAlpha = parseColorOrAlias('rgba(0, 0, 255, 2.5)');
		expect((withAlpha as any).a).toBe(1);
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

	it('rejects multi-dot strings like "1.2.3px"', () => {
		expect(parsePx('1.2.3px')).toBeNull();
	});

	it('trims whitespace before parsing', () => {
		expect(parsePx('  16px  ')).toBe(16);
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

	it('tolerates optional whitespace inside min()', () => {
		expect(parseFluidSpacing('min( 1.5rem, 3vw )')).toEqual({ desktop: 24, vw: 3 });
		expect(parseFluidSpacing('min(2rem , 4vw)')).toEqual({ desktop: 32, vw: 4 });
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
// cssVarToDisplayName
// ─────────────────────────────────────────────────────────────────────────────

describe('cssVarToDisplayName', () => {
	it('maps preset color vars to color/palette/{slug}', () => {
		expect(cssVarToDisplayName('var(--wp--preset--color--primary)')).toBe('color/palette/primary');
		expect(cssVarToDisplayName('var(--wp--preset--color--primary-lighter)')).toBe('color/palette/primary-lighter');
		expect(cssVarToDisplayName('var(--wp--preset--color--base-minus-1)')).toBe('color/palette/base-minus-1');
	});

	it('maps preset font-family vars to typography/fontFamilies/{slug}', () => {
		expect(cssVarToDisplayName('var(--wp--preset--font-family--montserrat)')).toBe('typography/fontFamilies/montserrat');
		expect(cssVarToDisplayName('var(--wp--preset--font-family--open-sans)')).toBe('typography/fontFamilies/open-sans');
	});

	it('maps preset font-size vars to typography/fontSizes/{slug}', () => {
		expect(cssVarToDisplayName('var(--wp--preset--font-size--x-large)')).toBe('typography/fontSizes/x-large');
		expect(cssVarToDisplayName('var(--wp--preset--font-size--normal)')).toBe('typography/fontSizes/normal');
	});

	it('maps preset spacing vars to spacing/{slug}', () => {
		expect(cssVarToDisplayName('var(--wp--preset--spacing--lg)')).toBe('spacing/lg');
	});

	it('maps preset border-radius vars to border/radiusSizes/{slug}', () => {
		expect(cssVarToDisplayName('var(--wp--preset--border-radius--sm)')).toBe('border/radiusSizes/sm');
	});

	it('maps custom vars to camelCase paths', () => {
		expect(cssVarToDisplayName('var(--wp--custom--body--typography--font-family)')).toBe('body/typography/fontFamily');
		expect(cssVarToDisplayName('var(--wp--custom--heading--typography--font-weight)')).toBe('heading/typography/fontWeight');
		expect(cssVarToDisplayName('var(--wp--custom--color--interactive)')).toBe('color/interactive');
	});

	it('maps theme vars to slash paths', () => {
		expect(cssVarToDisplayName('var(--theme--type--weight--bold)')).toBe('type/weight/bold');
		expect(cssVarToDisplayName('var(--theme--type--weight--regular)')).toBe('type/weight/regular');
	});

	it('maps token vars to slash paths', () => {
		expect(cssVarToDisplayName('var(--token--color--orange-50v)')).toBe('color/orange-50v');
		expect(cssVarToDisplayName('var(--token--color--blue-10v)')).toBe('color/blue-10v');
	});

	it('returns the input unchanged for non-var strings', () => {
		expect(cssVarToDisplayName('bold')).toBe('bold');
		expect(cssVarToDisplayName('#ff0000')).toBe('#ff0000');
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
			variableName: 'color/palette/primary',
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

	it('treats CSS var color references as VarAliasRef entries (not warnings)', () => {
		const { entries, warnings } = parseThemeJson({
			settings: { color: { palette: [{ slug: 'primary', color: 'var(--token--color--blue-50)' }] } },
		});
		expect(warnings).toHaveLength(0);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			collection: 'settings [color]',
			variableName: 'color/palette/primary',
			resolvedType: 'COLOR',
			modes: { Default: { type: 'VAR_ALIAS', cssVar: 'var(--token--color--blue-50)' } },
		});
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
			variableName: 'typography/fontSizes/xl',
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
			variableName: 'border/radiusSizes/sm',
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

	it('flattens settings.custom into settings [custom] entries, splitting color into settings [custom color]', () => {
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
		// color var reference → settings [custom color] as COLOR
		expect(entries.find(e => e.variableName === 'custom/color/link/default')).toMatchObject({
			collection: 'settings [custom color]',
			resolvedType: 'COLOR',
			modes: { Default: { type: 'VAR_ALIAS', cssVar: 'var(--wp--preset--color--primary)' } },
		});
		// non-color value → settings [custom] as before
		expect(entries.find(e => e.variableName === 'spacing/offset')).toMatchObject({
			collection: 'settings [custom]',
			resolvedType: 'FLOAT',
			modes: { Default: 8 },
		});
	});

	it('parses settings.custom.color hex values into settings [custom color] as COLOR entries', () => {
		const { entries, warnings } = parseThemeJson({
			settings: {
				custom: {
					color: {
						warning: '#e5a000',
						error: '#d54309',
					},
					gap: '16px',
				},
			},
		});
		expect(warnings).toHaveLength(0);
		expect(entries).toHaveLength(3); // 2 custom colors + 1 custom gap
		expect(entries.find(e => e.variableName === 'custom/color/warning')).toMatchObject({
			collection: 'settings [custom color]',
			resolvedType: 'COLOR',
			modes: { Default: { r: expect.any(Number), g: expect.any(Number), b: expect.any(Number), a: 1 } },
		});
		expect(entries.find(e => e.variableName === 'custom/color/error')).toMatchObject({
			collection: 'settings [custom color]',
			resolvedType: 'COLOR',
		});
		expect(entries.find(e => e.variableName === 'gap')).toMatchObject({
			collection: 'settings [custom]',
		});
	});

	it('treats var() references in settings.custom as VarAliasRef (STRING type)', () => {
		const { entries } = parseThemeJson({
			settings: {
				custom: {
					type: { weight: { bold: 'var(--theme--type--weight--bold)' } },
					typography: { fontFamily: { base: 'var(--wp--preset--font-family--body)' } },
				},
			},
		});
		expect(entries).toHaveLength(2);
		expect(entries.find(e => e.variableName === 'type/weight/bold')).toMatchObject({
			resolvedType: 'STRING',
			modes: { Default: { type: 'VAR_ALIAS', cssVar: 'var(--theme--type--weight--bold)' } },
		});
		expect(entries.find(e => e.variableName === 'typography/fontFamily/base')).toMatchObject({
			resolvedType: 'STRING',
			modes: { Default: { type: 'VAR_ALIAS', cssVar: 'var(--wp--preset--font-family--body)' } },
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

	it('flattens styles into styles entries, treating var() references as VarAliasRef', () => {
		const { entries } = parseThemeJson({
			styles: {
				elements: { link: { color: { text: 'var(--wp--preset--color--primary)' } } },
				typography: { fontFamily: 'var(--wp--preset--font-family--body)' },
				color: { text: '#333333' },
			},
		});
		expect(entries.find(e => e.variableName === 'elements/link/color/text')).toMatchObject({
			collection: 'styles',
			resolvedType: 'STRING',
			modes: { Default: { type: 'VAR_ALIAS', cssVar: 'var(--wp--preset--color--primary)' } },
		});
		expect(entries.find(e => e.variableName === 'typography/fontFamily')).toMatchObject({
			collection: 'styles',
			resolvedType: 'STRING',
			modes: { Default: { type: 'VAR_ALIAS', cssVar: 'var(--wp--preset--font-family--body)' } },
		});
		// Plain hex values remain as literal strings
		expect(entries.find(e => e.variableName === 'color/text')).toMatchObject({
			resolvedType: 'STRING',
			modes: { Default: '#333333' },
		});
	});

	// --- Combined ---

	it('parses settings.typography.fontFamilies into settings [static] entries', () => {
		const { entries, warnings } = parseThemeJson({
			settings: {
				typography: {
					fontFamilies: [
						{ slug: 'montserrat', name: 'Montserrat', fontFamily: 'Montserrat, sans-serif' },
						{ slug: 'open-sans', name: 'Open Sans', fontFamily: 'Open Sans, sans-serif' },
					],
				},
			},
		});
		expect(warnings).toHaveLength(0);
		expect(entries).toHaveLength(2);
		// Only the first font name is stored — no cascade, no quotes
		expect(entries[0]).toMatchObject({
			collection: 'settings [static]',
			variableName: 'typography/fontFamilies/montserrat',
			resolvedType: 'STRING',
			modes: { Default: 'Montserrat' },
		});
		expect(entries[1]).toMatchObject({
			collection: 'settings [static]',
			variableName: 'typography/fontFamilies/open-sans',
			resolvedType: 'STRING',
			modes: { Default: 'Open Sans' },
		});
	});

	it('skips font family entries with missing fontFamily value', () => {
		const { entries } = parseThemeJson({
			settings: {
				typography: {
					fontFamilies: [
						{ slug: 'montserrat', name: 'Montserrat' }, // no fontFamily field
					],
				},
			},
		});
		expect(entries).toHaveLength(0);
	});

	it('handles a full theme.json with multiple sections', () => {
		const { entries, warnings } = parseThemeJson({
			$schema: 'https://schemas.wp.org/trunk/theme.json',
			version: 3,
			settings: {
				color: { palette: [{ slug: 'primary', color: '#ff0000' }] },
				typography: {
					fontSizes: [{ slug: 'xl', size: '36px', fluid: { min: '24px', max: '36px' } }],
					fontFamilies: [{ slug: 'montserrat', name: 'Montserrat', fontFamily: 'Montserrat, sans-serif' }],
				},
				spacing: { spacingSizes: [{ slug: '4', size: 'min(2rem, 4vw)' }] },
				border: { radiusSizes: [{ slug: 'sm', size: '4px' }] },
				custom: { gap: '16px' },
			},
			styles: { color: { text: 'var(--wp--preset--color--primary)' } },
		});
		expect(warnings).toHaveLength(0);
		expect(entries).toHaveLength(7); // +1 for font family
		const collections = [...new Set(entries.map(e => e.collection))];
		expect(collections).toContain('settings [color]');
		expect(collections).toContain('settings [fluid]');
		expect(collections).toContain('settings [static]');
		expect(collections).toContain('settings [custom]');
		expect(collections).toContain('styles');
		// Font family entry lands in settings [static]
		expect(entries.filter(e => e.collection === 'settings [static]').map(e => e.variableName))
			.toContain('typography/fontFamilies/montserrat');
	});

	// --- slug validation ---

	it('warns and skips palette entries with missing slug', () => {
		const { entries, warnings } = parseThemeJson({
			settings: { color: { palette: [{ color: '#ff0000' }] } },
		});
		expect(entries).toHaveLength(0);
		expect(warnings.some(w => w.includes('missing or invalid slug'))).toBe(true);
	});

	it('warns and skips font size entries with missing slug', () => {
		const { entries, warnings } = parseThemeJson({
			settings: { typography: { fontSizes: [{ size: '16px' }] } },
		});
		expect(entries).toHaveLength(0);
		expect(warnings.some(w => w.includes('missing or invalid slug'))).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// writeImportEntries
// ─────────────────────────────────────────────────────────────────────────────

describe('writeImportEntries', () => {
	const makeCollection = (overrides: Record<string, any> = {}) => ({
		id: 'col1',
		name: 'settings [color]',
		variableIds: [],
		modes: [{ modeId: 'm1', name: 'Default' }],
		renameMode: vi.fn(),
		addMode: vi.fn().mockReturnValue('m2'),
		...overrides,
	});

	const makeVariable = (overrides: Record<string, any> = {}) => ({
		name: 'color/palette/primary',
		resolvedType: 'COLOR',
		setValueForMode: vi.fn(),
		...overrides,
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('creates a new variable in an existing collection', async () => {
		const collection = makeCollection({ variableIds: [] });
		const newVar = makeVariable();
		mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([collection]);
		mockFigma.variables.createVariable.mockReturnValue(newVar);

		const entries: ImportEntry[] = [{
			collection: 'settings [color]',
			variableName: 'color/palette/primary',
			resolvedType: 'COLOR',
			modes: { Default: { r: 1, g: 0, b: 0, a: 1 } },
		}];

		const result = await writeImportEntries(entries);

		expect(mockFigma.variables.createVariable).toHaveBeenCalledWith('color/palette/primary', collection, 'COLOR');
		expect(newVar.setValueForMode).toHaveBeenCalledWith('m1', { r: 1, g: 0, b: 0, a: 1 });
		expect(result).toMatchObject({ created: 1, updated: 0, skipped: 0 });
	});

	it('updates an existing variable', async () => {
		const existingVar = makeVariable();
		const collection = makeCollection({ variableIds: ['v1'] });
		mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([collection]);
		mockFigma.variables.getVariableByIdAsync.mockResolvedValue(existingVar);

		const entries: ImportEntry[] = [{
			collection: 'settings [color]',
			variableName: 'color/palette/primary',
			resolvedType: 'COLOR',
			modes: { Default: { r: 0, g: 0, b: 1, a: 1 } },
		}];

		const result = await writeImportEntries(entries);

		expect(mockFigma.variables.createVariable).not.toHaveBeenCalled();
		expect(existingVar.setValueForMode).toHaveBeenCalledWith('m1', { r: 0, g: 0, b: 1, a: 1 });
		expect(result).toMatchObject({ created: 0, updated: 1, skipped: 0 });
	});

	it('downgrades COLOR→STRING when the existing variable is STRING (e.g. transparent stored as CSS keyword)', async () => {
		const existingVar = makeVariable({ resolvedType: 'STRING' }); // existing is STRING
		const collection = makeCollection({ variableIds: ['v1'] });
		mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([collection]);
		mockFigma.variables.getVariableByIdAsync.mockResolvedValue(existingVar);

		const entries: ImportEntry[] = [{
			collection: 'settings [color]',
			variableName: 'color/palette/primary',
			resolvedType: 'COLOR', // import parsed a color value
			modes: { Default: { r: 1, g: 0, b: 0, a: 1 } },
		}];

		const result = await writeImportEntries(entries);

		// Should write '#ff0000' (CSS string) rather than skipping with a type-mismatch warning.
		expect(existingVar.setValueForMode).toHaveBeenCalledWith('m1', '#ff0000');
		expect(result).toMatchObject({ created: 0, updated: 1, skipped: 0 });
		expect(result.warnings.some(w => w.includes('does not match'))).toBe(false);
	});

	it('skips a variable when the existing type genuinely does not match (e.g. FLOAT vs STRING)', async () => {
		const existingVar = makeVariable({ resolvedType: 'STRING' }); // existing is STRING
		const collection = makeCollection({ variableIds: ['v1'] });
		mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([collection]);
		mockFigma.variables.getVariableByIdAsync.mockResolvedValue(existingVar);

		const entries: ImportEntry[] = [{
			collection: 'settings [color]',
			variableName: 'color/palette/primary', // matches the mock variable name
			resolvedType: 'FLOAT', // import wants FLOAT but existing is STRING
			modes: { Default: 4 },
		}];

		const result = await writeImportEntries(entries);

		expect(existingVar.setValueForMode).not.toHaveBeenCalled();
		expect(result).toMatchObject({ skipped: 1 });
		expect(result.warnings.some(w => w.includes('does not match'))).toBe(true);
	});

	it('creates a new collection when none exists', async () => {
		const newCollection = makeCollection({ variableIds: [] });
		const newVar = makeVariable();
		mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([]);
		mockFigma.variables.createVariableCollection.mockReturnValue(newCollection);
		mockFigma.variables.createVariable.mockReturnValue(newVar);

		const entries: ImportEntry[] = [{
			collection: 'settings [color]',
			variableName: 'color/palette/primary',
			resolvedType: 'COLOR',
			modes: { Default: { r: 1, g: 0, b: 0, a: 1 } },
		}];

		await writeImportEntries(entries);

		expect(mockFigma.variables.createVariableCollection).toHaveBeenCalledWith('settings [color]');
		expect(mockFigma.variables.createVariable).toHaveBeenCalled();
		expect(newVar.setValueForMode).toHaveBeenCalled();
	});

	it('does not overwrite existing-variable mode values for modes not in the import', async () => {
		// Collection has two modes: Default and Dark
		const existingVar = makeVariable();
		const collection = makeCollection({
			variableIds: ['v1'],
			modes: [
				{ modeId: 'm1', name: 'Default' },
				{ modeId: 'm2', name: 'Dark' },
			],
		});
		mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([collection]);
		mockFigma.variables.getVariableByIdAsync.mockResolvedValue(existingVar);

		// Import only provides Default mode
		const entries: ImportEntry[] = [{
			collection: 'settings [color]',
			variableName: 'color/palette/primary',
			resolvedType: 'COLOR',
			modes: { Default: { r: 1, g: 0, b: 0, a: 1 } },
		}];

		await writeImportEntries(entries);

		// Should only be called once (for Default), NOT for Dark
		expect(existingVar.setValueForMode).toHaveBeenCalledTimes(1);
		expect(existingVar.setValueForMode).toHaveBeenCalledWith('m1', { r: 1, g: 0, b: 0, a: 1 });
	});

	it('finds existing collections case-insensitively and trims whitespace', async () => {
		const collection = makeCollection({ name: 'Settings [Color] ', variableIds: [] });
		const newVar = makeVariable();
		mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([collection]);
		mockFigma.variables.createVariable.mockReturnValue(newVar);

		const entries: ImportEntry[] = [{
			collection: 'settings [color]',
			variableName: 'color/palette/primary',
			resolvedType: 'COLOR',
			modes: { Default: { r: 1, g: 0, b: 0, a: 1 } },
		}];

		await writeImportEntries(entries);

		// Should reuse the existing collection, not create a new one
		expect(mockFigma.variables.createVariableCollection).not.toHaveBeenCalled();
	});

	it('warns and counts skipped when createVariable throws', async () => {
		const collection = makeCollection({ variableIds: [] });
		mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([collection]);
		mockFigma.variables.createVariable.mockImplementation(() => { throw new Error('API error'); });

		const entries: ImportEntry[] = [{
			collection: 'settings [color]',
			variableName: 'color/palette/bad',
			resolvedType: 'COLOR',
			modes: { Default: { r: 1, g: 0, b: 0, a: 1 } },
		}];

		const result = await writeImportEntries(entries);

		expect(result.skipped).toBe(1);
		expect(result.warnings.some(w => w.includes('Could not create'))).toBe(true);
	});

	// --- VarAliasRef resolution ---

	it('resolves a VarAliasRef to a VARIABLE_ALIAS when the target collection exists locally', async () => {
		const colorCollection = makeCollection({ id: 'col-color', variableIds: [] });
		// USWDS source collection present locally
		const uswdsCollection = {
			id: 'col-uswds',
			name: '!-usa',
			variableIds: ['uswds-v1'],
			modes: [{ modeId: 'mu1', name: 'Default' }],
			renameMode: vi.fn(),
			addMode: vi.fn(),
		};
		const uswdsVar = { id: 'uswds-v1', name: 'color/orange-50v', resolvedType: 'COLOR', setValueForMode: vi.fn() };
		const newVar = makeVariable({ name: 'color/palette/orange' });

		mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([colorCollection, uswdsCollection]);
		mockFigma.variables.getVariableByIdAsync.mockImplementation(async (id: string) =>
			id === 'uswds-v1' ? uswdsVar : null
		);
		mockFigma.variables.createVariable.mockReturnValue(newVar);
		// Library path should not be reached
		mockFigma.teamLibrary.getAvailableLibraryVariableCollectionsAsync.mockResolvedValue([]);

		const aliasEntry: ImportEntry = {
			collection: 'settings [color]',
			variableName: 'color/palette/orange',
			resolvedType: 'COLOR',
			modes: { Default: { type: 'VAR_ALIAS', cssVar: 'var(--token--color--orange-50v)' } as VarAliasRef },
		};

		const result = await writeImportEntries([aliasEntry]);

		expect(newVar.setValueForMode).toHaveBeenCalledWith('m1', { type: 'VARIABLE_ALIAS', id: 'uswds-v1' });
		expect(result).toMatchObject({ created: 1, updated: 0, skipped: 0, warnings: [] });
	});

	it('resolves a VarAliasRef from a team library when not found locally', async () => {
		const colorCollection = makeCollection({ variableIds: [] });
		const newVar = makeVariable({ name: 'color/palette/orange' });

		// No local USWDS collection
		mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([colorCollection]);
		mockFigma.variables.createVariable.mockReturnValue(newVar);

		// Library has a !-usa collection containing the target variable
		const libCollection = { key: 'lib-col-key', name: '!-usa', libraryName: 'USWDS Tokens' };
		const libVar = { key: 'lib-var-key', name: 'color/orange-50v', resolvedType: 'COLOR' };
		const importedVar = { id: 'imported-var-id', resolvedType: 'COLOR' };

		mockFigma.teamLibrary.getAvailableLibraryVariableCollectionsAsync.mockResolvedValue([libCollection]);
		mockFigma.teamLibrary.getVariablesInLibraryCollectionAsync.mockResolvedValue([libVar]);
		mockFigma.variables.importVariableByKeyAsync.mockResolvedValue(importedVar);
		mockFigma.variables.getVariableByIdAsync.mockResolvedValue(importedVar);

		const aliasEntry: ImportEntry = {
			collection: 'settings [color]',
			variableName: 'color/palette/orange',
			resolvedType: 'COLOR',
			modes: { Default: { type: 'VAR_ALIAS', cssVar: 'var(--token--color--orange-50v)' } as VarAliasRef },
		};

		const result = await writeImportEntries([aliasEntry]);

		expect(mockFigma.variables.importVariableByKeyAsync).toHaveBeenCalledWith('lib-var-key');
		expect(newVar.setValueForMode).toHaveBeenCalledWith('m1', { type: 'VARIABLE_ALIAS', id: 'imported-var-id' });
		expect(result).toMatchObject({ created: 1, updated: 0, skipped: 0, warnings: [] });
	});

	it('creates a --wp-- VarAliasRef variable with a default value when target not yet available', async () => {
		// --wp-- vars are deferred to Pass 2 because the target may be created in the same
		// import batch. If still unresolvable after Pass 2, the variable is created with a
		// default value and a warning is emitted (rather than skipping entirely).
		const stylesCollection = makeCollection({ variableIds: [] });

		mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([stylesCollection]);
		mockFigma.teamLibrary.getAvailableLibraryVariableCollectionsAsync.mockResolvedValue([]);

		const newVar = makeVariable({ name: 'typography/fontFamily', resolvedType: 'STRING' });
		mockFigma.variables.createVariable.mockReturnValue(newVar);

		const aliasEntry: ImportEntry = {
			collection: 'styles',
			variableName: 'typography/fontFamily',
			resolvedType: 'STRING',
			modes: { Default: { type: 'VAR_ALIAS', cssVar: 'var(--wp--preset--font-family--body)' } as VarAliasRef },
		};

		const result = await writeImportEntries([aliasEntry]);

		// Variable IS created (with default value) since it's a --wp-- reference
		expect(mockFigma.variables.createVariable).toHaveBeenCalledWith('typography/fontFamily', expect.anything(), 'STRING');
		expect(result).toMatchObject({ created: 1, updated: 0, skipped: 0 });
		expect(result.warnings.some(w => w.includes('Could not resolve alias'))).toBe(true);
	});

	it('resolves a --wp-- VarAliasRef alias in Pass 2 when target is created in the same batch', async () => {
		// Simulates importing settings [custom]/body/typography/fontFamily → var(--wp--preset--font-family--montserrat)
		// where settings [custom]/typography/fontFamilies/montserrat is also being imported.
		// Pass 1: fontFamilies/montserrat is created first (concrete STRING value).
		// Pass 2: body/typography/fontFamily finds the just-created target and sets the alias.

		const customCollection = makeCollection({ name: 'settings [custom]', variableIds: [] });

		// Pass 1: getLocalVariableCollectionsAsync returns empty collection
		// Pass 2 (per-collection refresh + final refresh): returns collection with the new var
		const montserratVar = makeVariable({ name: 'typography/fontFamilies/montserrat', resolvedType: 'STRING', id: 'montserrat-id' });
		const bodyVar = makeVariable({ name: 'body/typography/fontFamily', resolvedType: 'STRING', id: 'body-ff-id' });
		const populatedCollection = { ...customCollection, variableIds: ['montserrat-id'] };

		let callCount = 0;
		mockFigma.variables.getLocalVariableCollectionsAsync.mockImplementation(() => {
			callCount++;
			// First call (initial snapshot) and second call (per-collection refresh in Pass 1):
			// still empty. Third call (Pass 2 refresh): montserrat exists.
			return Promise.resolve(callCount <= 2 ? [customCollection] : [populatedCollection]);
		});
		mockFigma.variables.getVariableByIdAsync.mockImplementation((id: string) =>
			Promise.resolve(id === 'montserrat-id' ? montserratVar : null)
		);
		mockFigma.teamLibrary.getAvailableLibraryVariableCollectionsAsync.mockResolvedValue([]);

		let createCount = 0;
		mockFigma.variables.createVariable.mockImplementation((_name: string, _col: any, type: string) => {
			createCount++;
			return createCount === 1
				? montserratVar  // typography/fontFamilies/montserrat (created first, concrete value)
				: bodyVar;       // body/typography/fontFamily (created second, deferred alias)
		});

		const concreteEntry: ImportEntry = {
			collection: 'settings [custom]',
			variableName: 'typography/fontFamilies/montserrat',
			resolvedType: 'STRING',
			modes: { Default: 'Montserrat, sans-serif' },
		};
		const aliasEntry: ImportEntry = {
			collection: 'settings [custom]',
			variableName: 'body/typography/fontFamily',
			resolvedType: 'STRING',
			modes: { Default: { type: 'VAR_ALIAS', cssVar: 'var(--wp--preset--font-family--montserrat)' } as VarAliasRef },
		};

		const result = await writeImportEntries([concreteEntry, aliasEntry]);

		expect(result).toMatchObject({ created: 2, updated: 0, skipped: 0, warnings: [] });
		// Pass 2 should have set the alias on body/typography/fontFamily
		expect(bodyVar.setValueForMode).toHaveBeenCalledWith(
			expect.any(String),
			{ type: 'VARIABLE_ALIAS', id: 'montserrat-id' }
		);
	});

	it('uses the target variable type when creating a STRING VarAliasRef that resolves to a COLOR variable', async () => {
		// styles/color/text should be a COLOR VARIABLE_ALIAS pointing at settings [color]/palette/primary.
		// flattenToEntries emits STRING as a placeholder, but the target is COLOR — so the
		// effective type should be COLOR and the alias should be set correctly.
		const colorVar = makeVariable({ name: 'palette/primary', resolvedType: 'COLOR', id: 'color-var-id' });
		const colorCollection = makeCollection({
			name: 'settings [color]',
			variableIds: ['color-var-id'],
		});
		const stylesCollection = makeCollection({ name: 'styles', variableIds: [] });

		mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([colorCollection, stylesCollection]);
		mockFigma.variables.getVariableByIdAsync.mockImplementation((id: string) =>
			Promise.resolve(id === 'color-var-id' ? colorVar : null)
		);
		mockFigma.teamLibrary.getAvailableLibraryVariableCollectionsAsync.mockResolvedValue([]);

		const newVar = makeVariable({ name: 'color/text', resolvedType: 'COLOR' });
		mockFigma.variables.createVariable.mockReturnValue(newVar);

		const aliasEntry: ImportEntry = {
			collection: 'styles',
			variableName: 'color/text',
			resolvedType: 'STRING',
			modes: { Default: { type: 'VAR_ALIAS', cssVar: 'var(--wp--preset--color--primary)' } as VarAliasRef },
		};

		const result = await writeImportEntries([aliasEntry]);

		// Variable is created as COLOR (target's type) and value is a VARIABLE_ALIAS
		expect(mockFigma.variables.createVariable).toHaveBeenCalledWith('color/text', expect.anything(), 'COLOR');
		expect(newVar.setValueForMode).toHaveBeenCalledWith(expect.any(String), { type: 'VARIABLE_ALIAS', id: 'color-var-id' });
		expect(result).toMatchObject({ created: 1, updated: 0, skipped: 0, warnings: [] });
	});

	it('skips (does not create) a variable when its VarAliasRef target cannot be found in settings [color]', async () => {
		const colorCollection = makeCollection({ variableIds: [] });

		// No USWDS collection anywhere — library returns empty
		mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([colorCollection]);
		mockFigma.teamLibrary.getAvailableLibraryVariableCollectionsAsync.mockResolvedValue([]);

		const aliasEntry: ImportEntry = {
			collection: 'settings [color]',
			variableName: 'color/palette/orange',
			resolvedType: 'COLOR',
			modes: { Default: { type: 'VAR_ALIAS', cssVar: 'var(--token--color--orange-50v)' } as VarAliasRef },
		};

		const result = await writeImportEntries([aliasEntry]);

		// Variable must NOT be created — no orphaned color swatch with wrong default
		expect(mockFigma.variables.createVariable).not.toHaveBeenCalled();
		expect(result).toMatchObject({ created: 0, updated: 0, skipped: 1 });
		expect(result.warnings.some(w => w.includes('Skipping') && w.includes('could not resolve'))).toBe(true);
		expect(result.warnings.some(w => w.includes('Enable the library'))).toBe(true);
	});

	it('creates a !-theme-tokens stub when a --theme-- VarAliasRef cannot be resolved from a library', async () => {
		// settings [custom]/body/typography/fontWeight = var(--theme--type--weight--regular)
		// The theme library isn't connected. The plugin should create:
		//   !-theme-tokens/theme/type/weight/regular  (STRING stub, value 'regular')
		// so that body/typography/fontWeight can alias it in Pass 1.

		const STUB_ID = 'stub-theme-var-id';

		const customCollection = makeCollection({ id: 'col-custom', name: 'settings [custom]', variableIds: [] });

		// Two snapshots of the !-theme-tokens collection:
		// - themeCollectionNew: returned by createVariableCollection (no variables yet)
		// - themeCollectionWithStub: returned by getLocalVariableCollectionsAsync in Pass 1 (stub exists)
		const themeCollectionNew = makeCollection({ id: 'col-theme', name: '!-theme-tokens', variableIds: [] });
		const themeCollectionWithStub = makeCollection({ id: 'col-theme', name: '!-theme-tokens', variableIds: [STUB_ID] });

		const stubVar = makeVariable({ id: STUB_ID, name: 'theme/type/weight/regular', resolvedType: 'STRING' });
		const fontWeightVar = makeVariable({ name: 'body/typography/fontWeight', resolvedType: 'STRING' });

		mockFigma.variables.createVariableCollection.mockReturnValue(themeCollectionNew);
		mockFigma.variables.createVariable
			.mockReturnValueOnce(stubVar)        // pre-pass: !-theme-tokens/theme/type/weight/regular
			.mockReturnValueOnce(fontWeightVar); // Pass 1: settings [custom]/body/typography/fontWeight

		mockFigma.variables.getLocalVariableCollectionsAsync
			.mockResolvedValueOnce([customCollection])               // call 1: existingCollections snapshot
			.mockResolvedValueOnce([customCollection])               // call 2: pre-pass resolve check (stub not yet created)
			.mockResolvedValue([customCollection, themeCollectionWithStub]); // call 3+: Pass 1 (stub now exists)

		mockFigma.teamLibrary.getAvailableLibraryVariableCollectionsAsync.mockResolvedValue([]);

		mockFigma.variables.getVariableByIdAsync.mockImplementation(async (id: string) => {
			if (id === STUB_ID) return stubVar;
			return null;
		});

		const aliasEntry: ImportEntry = {
			collection: 'settings [custom]',
			variableName: 'body/typography/fontWeight',
			resolvedType: 'STRING',
			modes: { Default: { type: 'VAR_ALIAS', cssVar: 'var(--theme--type--weight--regular)' } as VarAliasRef },
		};

		const result = await writeImportEntries([aliasEntry]);

		// !-theme-tokens collection created
		expect(mockFigma.variables.createVariableCollection).toHaveBeenCalledWith('!-theme-tokens');
		// Stub IS created in !-theme-tokens
		expect(mockFigma.variables.createVariable).toHaveBeenCalledWith(
			'theme/type/weight/regular', expect.anything(), 'STRING'
		);
		// Stub value set to the slug so Figma doesn't show "String value" placeholder
		expect(stubVar.setValueForMode).toHaveBeenCalledWith('m1', 'regular');
		// fontWeight variable IS created and aliases the stub
		expect(mockFigma.variables.createVariable).toHaveBeenCalledWith(
			'body/typography/fontWeight', expect.anything(), 'STRING'
		);
		// 2 created: the stub + the fontWeight variable; no warnings
		expect(result).toMatchObject({ created: 2, skipped: 0 });
		expect(result.warnings).toHaveLength(0);
	});
});
