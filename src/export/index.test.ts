import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportToJSON } from './index';
import { mockFigma } from '../test-setup';

function col(name: string, modes: { modeId: string; name: string }[], variableIds: string[]) {
	return { name, modes, variableIds };
}

function variable(name: string, resolvedType: string, valuesByMode: Record<string, any>) {
	return { name, resolvedType, valuesByMode };
}

function getBody() {
	return mockFigma.ui.postMessage.mock.calls[0][0].files[0].body;
}

describe('exportToJSON', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([]);
	});

	it('emits default theme when no collections exist', async () => {
		await exportToJSON();
		expect(mockFigma.ui.postMessage).toHaveBeenCalledWith({
			type: 'EXPORT_RESULT',
			files: [{ fileName: 'theme.json', body: {
				'$schema': 'https://schemas.wp.org/trunk/theme.json',
				version: 3,
				settings: { custom: {} },
			}}],
		});
	});

	it('preserves unrelated keys from base theme', async () => {
		const baseTheme = {
			'$schema': 'https://schemas.wp.org/trunk/theme.json',
			version: 3,
			settings: { custom: { existing: 'value' }, color: { defaultPalette: false } },
		};
		await exportToJSON({ baseTheme });
		const body = getBody();
		expect(body.settings.custom.existing).toBe('value');
		expect(body.settings.color.defaultPalette).toBe(false);
	});

	it('skips variables whose path contains *', async () => {
		mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
			col('settings [color]', [{ modeId: 'm1', name: 'Default' }], ['v1', 'v2']),
		]);
		mockFigma.variables.getVariableByIdAsync
			.mockResolvedValueOnce(variable('palette/skip*', 'COLOR', { m1: { r: 1, g: 0, b: 0, a: 1 } }))
			.mockResolvedValueOnce(variable('palette/keep', 'COLOR', { m1: { r: 0, g: 1, b: 0, a: 1 } }));

		await exportToJSON();
		const palette = getBody().settings.color.palette;
		expect(palette).toHaveLength(1);
		expect(palette[0].slug).toBe('keep');
	});

	it('returns early and skips collection with no modes', async () => {
		mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
			col('settings [color]', [], ['v1']),
		]);
		mockFigma.variables.getVariableByIdAsync.mockResolvedValue(
			variable('palette/primary', 'COLOR', {})
		);
		await exportToJSON();
		expect(getBody().settings.color).toBeUndefined();
	});

	it('ignores collections with unrecognized names', async () => {
		mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
			col('my custom tokens', [{ modeId: 'm1', name: 'Default' }], ['v1']),
		]);
		mockFigma.variables.getVariableByIdAsync.mockResolvedValue(
			variable('color/primary', 'COLOR', { m1: { r: 1, g: 0, b: 0, a: 1 } })
		);
		await exportToJSON();
		expect(getBody().settings.color).toBeUndefined();
	});

	// -----------------------------------------------------------------------
	// settings [color]
	// -----------------------------------------------------------------------

	describe('settings [color]', () => {
		const MODE = { modeId: 'm1', name: 'Default' };

		it('builds palette using last path segment for slug and name', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				col('settings [color]', [MODE], ['v1']),
			]);
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(
				variable('color-palette/primary-dark', 'COLOR', { m1: { r: 0, g: 0, b: 0, a: 1 } })
			);
			await exportToJSON();
			expect(getBody().settings.color.palette).toEqual([
				{ slug: 'primary-dark', name: 'Primary Dark', color: '#000000' },
			]);
		});

		it('passes through STRING values as-is', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				col('settings [color]', [MODE], ['v1']),
			]);
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(
				variable('palette/translucent', 'STRING', { m1: 'rgba(0,0,0,0.6)' })
			);
			await exportToJSON();
			expect(getBody().settings.color.palette[0].color).toBe('rgba(0,0,0,0.6)');
		});

		it('resolves alias to CSS var', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				col('settings [color]', [MODE], ['v1']),
			]);
			mockFigma.variables.getVariableByIdAsync
				.mockResolvedValueOnce(variable('palette/primary', 'COLOR', {
					m1: { type: 'VARIABLE_ALIAS', id: 'token-var' },
				}))
				.mockResolvedValueOnce({
					name: 'color/blue/60v',
					resolvedType: 'COLOR',
					variableCollectionId: 'col-usa',
				});
			mockFigma.variables.getVariableCollectionByIdAsync.mockResolvedValue({ name: '!-usa/color' });

			await exportToJSON();
			expect(getBody().settings.color.palette[0].color).toBe('var(--token--color--blue-60v)');
		});

		it('does not add palette to theme when collection is empty', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				col('settings [color]', [MODE], []),
			]);
			await exportToJSON();
			expect(getBody().settings.color).toBeUndefined();
		});
	});

	// -----------------------------------------------------------------------
	// settings [fluid]
	// -----------------------------------------------------------------------

	describe('settings [fluid]', () => {
		const MODES = [
			{ modeId: 'desktop', name: 'Desktop' },
			{ modeId: 'mobile', name: 'Mobile' },
			{ modeId: 'vw', name: 'vw' },
		];

		it('maps font-size variables to settings.typography.fontSizes', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				col('settings [fluid]', MODES, ['v1']),
			]);
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(
				variable('font-size/xl', 'FLOAT', { desktop: 36, mobile: 24, vw: 3 })
			);
			await exportToJSON();
			expect(getBody().settings.typography.fontSizes).toEqual([
				{ slug: 'xl', name: 'Xl', size: '36px', fluid: { min: '24px', max: '36px' } },
			]);
		});

		it('maps spacing variables to settings.spacing.spacingSizes with fluid formula', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				col('settings [fluid]', MODES, ['v1']),
			]);
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(
				variable('spacing/4', 'FLOAT', { desktop: 32, mobile: 16, vw: 3 })
			);
			await exportToJSON();
			expect(getBody().settings.spacing.spacingSizes).toEqual([
				{ slug: '4', name: '4', size: 'min(2rem, 3vw)' },
			]);
		});

		it('skips non-FLOAT variables', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				col('settings [fluid]', MODES, ['v1']),
			]);
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(
				variable('font-size/xl', 'STRING', { desktop: '36px', mobile: '24px', vw: '3vw' })
			);
			await exportToJSON();
			expect(getBody().settings.typography).toBeUndefined();
		});

		it('returns early when no desktop mode', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				col('settings [fluid]', [{ modeId: 'mobile', name: 'Mobile' }], ['v1']),
			]);
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(
				variable('font-size/xl', 'FLOAT', { mobile: 24 })
			);
			await exportToJSON();
			expect(getBody().settings.typography).toBeUndefined();
		});
	});

	// -----------------------------------------------------------------------
	// settings [static]
	// -----------------------------------------------------------------------

	describe('settings [static]', () => {
		const MODE = { modeId: 'm1', name: 'Default' };

		it('maps two-part FLOAT variable to settings key with px suffix', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				col('settings [static]', [MODE], ['v1']),
			]);
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(
				variable('layout/contentSize', 'FLOAT', { m1: 1200 })
			);
			await exportToJSON();
			expect(getBody().settings.layout.contentSize).toBe('1200px');
		});

		it('preserves camelCase keys from Figma variable name', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				col('settings [static]', [MODE], ['v1']),
			]);
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(
				variable('layout/wideSize', 'FLOAT', { m1: 1400 })
			);
			await exportToJSON();
			expect(getBody().settings.layout.wideSize).toBe('1400px');
		});

		it('maps border/radius-sizes to settings.border.radiusSizes', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				col('settings [static]', [MODE], ['v1', 'v2']),
			]);
			mockFigma.variables.getVariableByIdAsync
				.mockResolvedValueOnce(variable('border/radius-sizes/sm', 'FLOAT', { m1: 4 }))
				.mockResolvedValueOnce(variable('border/radius-sizes/md', 'FLOAT', { m1: 8 }));
			await exportToJSON();
			expect(getBody().settings.border.radiusSizes).toEqual([
				{ slug: 'sm', name: 'Sm', size: '4px' },
				{ slug: 'md', name: 'Md', size: '8px' },
			]);
		});

		it('maps dimensions/aspect-ratios to settings.dimensions.aspectRatios with human-readable names', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				col('settings [static]', [MODE], ['v1']),
			]);
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(
				variable('dimensions/aspect-ratios/16-9', 'STRING', { m1: '16/9' })
			);
			await exportToJSON();
			expect(getBody().settings.dimensions.aspectRatios).toEqual([
				{ slug: '16-9', name: 'Wide', ratio: '16/9' },
			]);
		});

		it('maps shadow/presets to settings.shadow.presets', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				col('settings [static]', [MODE], ['v1']),
			]);
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(
				variable('shadow/presets/card', 'STRING', { m1: '0 2px 8px rgba(0,0,0,0.1)' })
			);
			await exportToJSON();
			expect(getBody().settings.shadow.presets).toEqual([
				{ slug: 'card', name: 'Card', shadow: '0 2px 8px rgba(0,0,0,0.1)' },
			]);
		});

		it('skips typography/* variables', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				col('settings [static]', [MODE], ['v1']),
			]);
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(
				variable('typography/fontFamily', 'STRING', { m1: 'Public Sans' })
			);
			await exportToJSON();
			expect(getBody().settings.typography).toBeUndefined();
		});
	});

	// -----------------------------------------------------------------------
	// settings [custom]
	// -----------------------------------------------------------------------

	describe('settings [custom]', () => {
		const MODE = { modeId: 'm1', name: 'Default' };

		it('maps variable path to settings.custom.*', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				col('settings [custom]', [MODE], ['v1']),
			]);
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(
				variable('color/link/default', 'STRING', { m1: '#0070d2' })
			);
			await exportToJSON();
			expect(getBody().settings.custom.color.link.default).toBe('#0070d2');
		});

		it('strips leading custom/ prefix to avoid double-nesting', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				col('settings [custom]', [MODE], ['v1']),
			]);
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(
				variable('custom/color/interactive', 'STRING', { m1: '#0a5' })
			);
			await exportToJSON();
			expect(getBody().settings.custom.color.interactive).toBe('#0a5');
			expect(getBody().settings.custom.custom).toBeUndefined();
		});

		it('converts COLOR value to hex', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				col('settings [custom]', [MODE], ['v1']),
			]);
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(
				variable('color/brand', 'COLOR', { m1: { r: 1, g: 0, b: 0, a: 1 } })
			);
			await exportToJSON();
			expect(getBody().settings.custom.color.brand).toBe('#ff0000');
		});
	});

	// -----------------------------------------------------------------------
	// settings [custom color]
	// -----------------------------------------------------------------------

	describe('settings [custom color]', () => {
		const MODE = { modeId: 'm1', name: 'Default' };

		it('maps variable path to settings.custom.*', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				col('settings [custom color]', [MODE], ['v1']),
			]);
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(
				variable('color/link/default', 'COLOR', { m1: { r: 0, g: 0, b: 1, a: 1 } })
			);
			await exportToJSON();
			expect(getBody().settings.custom.color.link.default).toBe('#0000ff');
		});
	});

	// -----------------------------------------------------------------------
	// styles
	// -----------------------------------------------------------------------

	describe('styles', () => {
		const MODE = { modeId: 'm1', name: 'Default' };

		it('maps variable path to styles.*', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				col('styles', [MODE], ['v1']),
			]);
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(
				variable('elements/link/color/text', 'STRING', { m1: 'var(--theme--color--link)' })
			);
			await exportToJSON();
			expect(getBody().styles.elements.link.color.text).toBe('var(--theme--color--link)');
		});

		it('supports pseudo-selector path segments', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				col('styles', [MODE], ['v1']),
			]);
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(
				variable('elements/link/:hover/color/text', 'STRING', { m1: 'var(--theme--color--link-hover)' })
			);
			await exportToJSON();
			expect(getBody().styles.elements.link[':hover'].color.text).toBe('var(--theme--color--link-hover)');
		});
	});
});
