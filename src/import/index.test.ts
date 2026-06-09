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

	it('treats CSS var color references as VarAliasRef entries (not warnings)', () => {
		const { entries, warnings } = parseThemeJson({
			settings: { color: { palette: [{ slug: 'primary', color: 'var(--token--color--blue-50)' }] } },
		});
		expect(warnings).toHaveLength(0);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			collection: 'settings [color]',
			variableName: 'palette/primary',
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
		// var() reference becomes a VarAliasRef so the alias can be re-linked in Figma
		expect(entries.find(e => e.variableName === 'color/link/default')).toMatchObject({
			collection: 'settings [custom]',
			resolvedType: 'STRING',
			modes: { Default: { type: 'VAR_ALIAS', cssVar: 'var(--wp--preset--color--primary)' } },
		});
		expect(entries.find(e => e.variableName === 'spacing/offset')).toMatchObject({
			collection: 'settings [custom]',
			resolvedType: 'FLOAT',
			modes: { Default: 8 },
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
		name: 'palette/primary',
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
			variableName: 'palette/primary',
			resolvedType: 'COLOR',
			modes: { Default: { r: 1, g: 0, b: 0, a: 1 } },
		}];

		const result = await writeImportEntries(entries);

		expect(mockFigma.variables.createVariable).toHaveBeenCalledWith('palette/primary', collection, 'COLOR');
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
			variableName: 'palette/primary',
			resolvedType: 'COLOR',
			modes: { Default: { r: 0, g: 0, b: 1, a: 1 } },
		}];

		const result = await writeImportEntries(entries);

		expect(mockFigma.variables.createVariable).not.toHaveBeenCalled();
		expect(existingVar.setValueForMode).toHaveBeenCalledWith('m1', { r: 0, g: 0, b: 1, a: 1 });
		expect(result).toMatchObject({ created: 0, updated: 1, skipped: 0 });
	});

	it('skips a variable when the existing type does not match', async () => {
		const existingVar = makeVariable({ resolvedType: 'STRING' }); // existing is STRING
		const collection = makeCollection({ variableIds: ['v1'] });
		mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([collection]);
		mockFigma.variables.getVariableByIdAsync.mockResolvedValue(existingVar);

		const entries: ImportEntry[] = [{
			collection: 'settings [color]',
			variableName: 'palette/primary',
			resolvedType: 'COLOR', // import wants COLOR
			modes: { Default: { r: 1, g: 0, b: 0, a: 1 } },
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
			variableName: 'palette/primary',
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
			variableName: 'palette/primary',
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
			variableName: 'palette/primary',
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
			variableName: 'palette/bad',
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
		const newVar = makeVariable({ name: 'palette/orange' });

		mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([colorCollection, uswdsCollection]);
		mockFigma.variables.getVariableByIdAsync.mockImplementation(async (id: string) =>
			id === 'uswds-v1' ? uswdsVar : null
		);
		mockFigma.variables.createVariable.mockReturnValue(newVar);
		// Library path should not be reached
		mockFigma.teamLibrary.getAvailableLibraryVariableCollectionsAsync.mockResolvedValue([]);

		const aliasEntry: ImportEntry = {
			collection: 'settings [color]',
			variableName: 'palette/orange',
			resolvedType: 'COLOR',
			modes: { Default: { type: 'VAR_ALIAS', cssVar: 'var(--token--color--orange-50v)' } as VarAliasRef },
		};

		const result = await writeImportEntries([aliasEntry]);

		expect(newVar.setValueForMode).toHaveBeenCalledWith('m1', { type: 'VARIABLE_ALIAS', id: 'uswds-v1' });
		expect(result).toMatchObject({ created: 1, updated: 0, skipped: 0, warnings: [] });
	});

	it('resolves a VarAliasRef from a team library when not found locally', async () => {
		const colorCollection = makeCollection({ variableIds: [] });
		const newVar = makeVariable({ name: 'palette/orange' });

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
			variableName: 'palette/orange',
			resolvedType: 'COLOR',
			modes: { Default: { type: 'VAR_ALIAS', cssVar: 'var(--token--color--orange-50v)' } as VarAliasRef },
		};

		const result = await writeImportEntries([aliasEntry]);

		expect(mockFigma.variables.importVariableByKeyAsync).toHaveBeenCalledWith('lib-var-key');
		expect(newVar.setValueForMode).toHaveBeenCalledWith('m1', { type: 'VARIABLE_ALIAS', id: 'imported-var-id' });
		expect(result).toMatchObject({ created: 1, updated: 0, skipped: 0, warnings: [] });
	});

	it('falls back to literal string for STRING VarAliasRef when target cannot be resolved', async () => {
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

		// Variable IS created with the literal CSS var string as fallback
		expect(mockFigma.variables.createVariable).toHaveBeenCalled();
		expect(newVar.setValueForMode).toHaveBeenCalledWith(expect.any(String), 'var(--wp--preset--font-family--body)');
		expect(result).toMatchObject({ created: 1, updated: 0, skipped: 0 });
		expect(result.warnings.some(w => w.includes('could not resolve') && w.includes('literal string'))).toBe(true);
	});

	it('falls back to literal string for STRING VarAliasRef when target variable is a different type (e.g. COLOR)', async () => {
		// STRING variable in styles references a var() that resolves to a COLOR variable.
		// Figma rejects STRING→COLOR aliases, so we must store the literal string instead.
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

		const newVar = makeVariable({ name: 'color/text', resolvedType: 'STRING' });
		mockFigma.variables.createVariable.mockReturnValue(newVar);

		const aliasEntry: ImportEntry = {
			collection: 'styles',
			variableName: 'color/text',
			resolvedType: 'STRING',
			modes: { Default: { type: 'VAR_ALIAS', cssVar: 'var(--wp--preset--color--primary)' } as VarAliasRef },
		};

		const result = await writeImportEntries([aliasEntry]);

		// Variable is created but value is the literal CSS var string, NOT a VARIABLE_ALIAS
		expect(mockFigma.variables.createVariable).toHaveBeenCalled();
		expect(newVar.setValueForMode).toHaveBeenCalledWith(expect.any(String), 'var(--wp--preset--color--primary)');
		expect(result).toMatchObject({ created: 1, updated: 0, skipped: 0 });
	});

	it('skips (does not create) a variable when its VarAliasRef target cannot be found', async () => {
		const colorCollection = makeCollection({ variableIds: [] });

		// No USWDS collection anywhere — library returns empty
		mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([colorCollection]);
		mockFigma.teamLibrary.getAvailableLibraryVariableCollectionsAsync.mockResolvedValue([]);

		const aliasEntry: ImportEntry = {
			collection: 'settings [color]',
			variableName: 'palette/orange',
			resolvedType: 'COLOR',
			modes: { Default: { type: 'VAR_ALIAS', cssVar: 'var(--token--color--orange-50v)' } as VarAliasRef },
		};

		const result = await writeImportEntries([aliasEntry]);

		// Variable must NOT be created — no orphaned variable with an unresolved alias
		expect(mockFigma.variables.createVariable).not.toHaveBeenCalled();
		expect(result).toMatchObject({ created: 0, updated: 0, skipped: 1 });
		expect(result.warnings.some(w => w.includes('Skipping') && w.includes('could not resolve'))).toBe(true);
		expect(result.warnings.some(w => w.includes('Enable the library'))).toBe(true);
	});
});
