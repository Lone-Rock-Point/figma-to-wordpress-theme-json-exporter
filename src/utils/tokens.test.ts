import { describe, it, expect } from 'vitest';
import { transformTokenReference } from './tokens';

describe('transformTokenReference', () => {
	describe('!-usa collection', () => {
		it('resolves by collection name prefix', () => {
			expect(transformTokenReference('!-usa/color', 'color/blue/5v'))
				.toBe('var(--token--color--blue-5v)');
		});

		it('resolves by variable name prefix', () => {
			expect(transformTokenReference('some-library', '!-usa/color/blue/5v'))
				.toBe('var(--token--color--blue-5v)');
		});

		it('joins rest of path with hyphens', () => {
			expect(transformTokenReference('!-usa', 'color/blue/60v'))
				.toBe('var(--token--color--blue-60v)');
		});
	});

	describe('!-theme collection', () => {
		it('resolves collection name prefix to var(--path--as--double-dashes)', () => {
			expect(transformTokenReference('!-theme-tokens', 'theme/color/accent'))
				.toBe('var(--theme--color--accent)');
		});

		it('strips the !-theme prefix from the path', () => {
			expect(transformTokenReference('!-theme-tokens', '!-theme-tokens/type/weight/bold'))
				.toBe('var(--type--weight--bold)');
		});

		it('resolves by variable name prefix', () => {
			expect(transformTokenReference('design-tokens', '!-theme/type/weight/bold'))
				.toBe('var(--type--weight--bold)');
		});
	});

	describe('settings [color]', () => {
		it('uses last path segment as slug', () => {
			expect(transformTokenReference('settings [color]', 'palette/primary-dark'))
				.toBe('var(--wp--preset--color--primary-dark)');
		});

		it('is case-insensitive on collection name', () => {
			expect(transformTokenReference('Settings [Color]', 'palette/primary'))
				.toBe('var(--wp--preset--color--primary)');
		});
	});

	describe('settings [custom color]', () => {
		it('uses full path for CSS var (not just last segment)', () => {
			expect(transformTokenReference('settings [custom color]', 'color/link/default'))
				.toBe('var(--wp--custom--color--link--default)');
		});

		it('strips leading custom/ prefix', () => {
			expect(transformTokenReference('settings [custom color]', 'custom/color/brand'))
				.toBe('var(--wp--custom--color--brand)');
		});
	});

	describe('settings [static]', () => {
		it('resolves border/radius-sizes/{slug} to preset border-radius', () => {
			expect(transformTokenReference('settings [static]', 'border/radius-sizes/medium'))
				.toBe('var(--wp--preset--border-radius--medium)');
		});

		it('handles camelCase radiusSizes segment', () => {
			expect(transformTokenReference('settings [static]', 'border/radiusSizes/lg'))
				.toBe('var(--wp--preset--border-radius--lg)');
		});

		it('resolves typography/fontFamilies/{slug} to preset font-family', () => {
			expect(transformTokenReference('settings [static]', 'typography/fontFamilies/montserrat'))
				.toBe('var(--wp--preset--font-family--montserrat)');
		});

		it('falls through to fallback for non-border-radius static vars', () => {
			expect(transformTokenReference('settings [static]', 'layout/contentSize'))
				.toBe('var(--wp--custom--layout--content-size)');
		});
	});

	describe('settings [custom]', () => {
		it('maps variable path to --wp--custom-- reference', () => {
			expect(transformTokenReference('settings [custom]', 'color/interactive/default'))
				.toBe('var(--wp--custom--color--interactive--default)');
		});

		it('strips leading custom/ prefix to prevent double-nesting', () => {
			expect(transformTokenReference('settings [custom]', 'custom/color/interactive'))
				.toBe('var(--wp--custom--color--interactive)');
		});

		it('strips leading Custom/ prefix (capital C)', () => {
			expect(transformTokenReference('settings [custom]', 'Custom/color/brand'))
				.toBe('var(--wp--custom--color--brand)');
		});

		it('resolves typography/fontFamilies/{slug} to preset font-family', () => {
			expect(transformTokenReference('settings [custom]', 'typography/fontFamilies/public-sans'))
				.toBe('var(--wp--preset--font-family--public-sans)');
		});

		it('resolves typography/font-families/{slug} to preset font-family', () => {
			expect(transformTokenReference('settings [custom]', 'typography/font-families/public-sans'))
				.toBe('var(--wp--preset--font-family--public-sans)');
		});

		it('normalizes camelCase slug to kebab-case in CSS var', () => {
			expect(transformTokenReference('settings [custom]', 'color/linkDefault'))
				.toBe('var(--wp--custom--color--link-default)');
		});
	});

	describe('settings [fluid]', () => {
		it('resolves font-size/* to preset font-size', () => {
			expect(transformTokenReference('settings [fluid]', 'font-size/xl'))
				.toBe('var(--wp--preset--font-size--xl)');
		});

		it('resolves typography/* to preset font-size', () => {
			expect(transformTokenReference('settings [fluid]', 'typography/xl'))
				.toBe('var(--wp--preset--font-size--xl)');
		});

		it('resolves spacing/* to preset spacing', () => {
			expect(transformTokenReference('settings [fluid]', 'spacing/4'))
				.toBe('var(--wp--preset--spacing--4)');
		});

		it('falls through to fallback for unrecognized group', () => {
			expect(transformTokenReference('settings [fluid]', 'border/sm'))
				.toBe('var(--wp--custom--border--sm)');
		});
	});

	describe('fallback', () => {
		it('detects typography/fontFamilies pattern in any collection', () => {
			expect(transformTokenReference('my-design-tokens', 'typography/fontFamilies/public-sans'))
				.toBe('var(--wp--preset--font-family--public-sans)');
		});

		it('detects typography/font-families pattern in any collection', () => {
			expect(transformTokenReference('library', 'typography/font-families/roboto'))
				.toBe('var(--wp--preset--font-family--roboto)');
		});

		it('does NOT treat typography/fontFamilies (no slug) as a font-family preset', () => {
			expect(transformTokenReference('library', 'typography/fontFamilies'))
				.toBe('var(--wp--custom--typography--font-families)');
		});

		it('normalizes camelCase segments to kebab-case', () => {
			expect(transformTokenReference('unknown', 'some/camelCase/variable'))
				.toBe('var(--wp--custom--some--camel-case--variable)');
		});

		it('normalizes spaces to hyphens', () => {
			expect(transformTokenReference('unknown', 'some/spaced value'))
				.toBe('var(--wp--custom--some--spaced-value)');
		});
	});
});
