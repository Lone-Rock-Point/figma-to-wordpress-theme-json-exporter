import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hasCssVarSyntax, applyCssVarSyntaxToVariables } from './figma-variables';
import { mockFigma } from '../test-setup';

describe('figma-variables utilities', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ---------------------------------------------------------------------------
	// hasCssVarSyntax
	// ---------------------------------------------------------------------------

	describe('hasCssVarSyntax', () => {
		it('returns true for --wp--custom-- references', () => {
			expect(hasCssVarSyntax('var(--wp--custom--color--primary)')).toBe(true);
		});

		it('returns true for --wp--preset-- references', () => {
			expect(hasCssVarSyntax('var(--wp--preset--color--primary)')).toBe(true);
		});

		it('returns true for --token-- references', () => {
			expect(hasCssVarSyntax('var(--token--color--blue-5v)')).toBe(true);
		});

		it('returns true for bare custom property references', () => {
			expect(hasCssVarSyntax('var(--theme--color--accent)')).toBe(true);
		});

		it('returns false for plain strings', () => {
			expect(hasCssVarSyntax('Some code syntax')).toBe(false);
			expect(hasCssVarSyntax('#ff0000')).toBe(false);
			expect(hasCssVarSyntax('')).toBe(false);
		});
	});

	// ---------------------------------------------------------------------------
	// applyCssVarSyntaxToVariables
	// ---------------------------------------------------------------------------

	describe('applyCssVarSyntaxToVariables', () => {
		const mockVariable = (overrides: Record<string, any> = {}) => ({
			name: 'palette/primary',
			resolvedType: 'COLOR',
			valuesByMode: { mode1: { r: 1, g: 0, b: 0 } },
			codeSyntax: { WEB: '' },
			setVariableCodeSyntax: vi.fn(),
			...overrides,
		});

		const mockCollection = (overrides: Record<string, any> = {}) => ({
			name: 'settings [color]',
			variableIds: ['var1'],
			...overrides,
		});

		// --- Correct CSS var per collection type ---

		it('generates --wp--preset--color-- for settings [color] variables', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([mockCollection()]);
			const variable = mockVariable({ name: 'palette/primary' });
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(variable);

			await applyCssVarSyntaxToVariables({ overwriteExisting: false });

			expect(variable.setVariableCodeSyntax).toHaveBeenCalledWith('WEB', 'var(--wp--preset--color--primary)');
		});

		it('generates --wp--preset--font-size-- for settings [fluid] font variables', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				mockCollection({ name: 'settings [fluid]' }),
			]);
			const variable = mockVariable({ name: 'font-size/xl', resolvedType: 'FLOAT' });
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(variable);

			await applyCssVarSyntaxToVariables({ overwriteExisting: false });

			expect(variable.setVariableCodeSyntax).toHaveBeenCalledWith('WEB', 'var(--wp--preset--font-size--xl)');
		});

		it('generates --wp--preset--spacing-- for settings [fluid] spacing variables', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				mockCollection({ name: 'settings [fluid]' }),
			]);
			const variable = mockVariable({ name: 'spacing/4', resolvedType: 'FLOAT' });
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(variable);

			await applyCssVarSyntaxToVariables({ overwriteExisting: false });

			expect(variable.setVariableCodeSyntax).toHaveBeenCalledWith('WEB', 'var(--wp--preset--spacing--4)');
		});

		it('generates --wp--preset--border-radius-- for settings [static] border/radius-sizes variables', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				mockCollection({ name: 'settings [static]' }),
			]);
			const variable = mockVariable({ name: 'border/radius-sizes/sm', resolvedType: 'FLOAT' });
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(variable);

			await applyCssVarSyntaxToVariables({ overwriteExisting: false });

			expect(variable.setVariableCodeSyntax).toHaveBeenCalledWith('WEB', 'var(--wp--preset--border-radius--sm)');
		});

		it('generates --wp--custom-- for settings [custom] variables', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				mockCollection({ name: 'settings [custom]' }),
			]);
			const variable = mockVariable({ name: 'color/link/default', resolvedType: 'STRING' });
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(variable);

			await applyCssVarSyntaxToVariables({ overwriteExisting: false });

			expect(variable.setVariableCodeSyntax).toHaveBeenCalledWith('WEB', 'var(--wp--custom--color--link--default)');
		});

		it('generates --wp--custom-- for settings [custom color] variables', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				mockCollection({ name: 'settings [custom color]' }),
			]);
			const variable = mockVariable({ name: 'color/brand', resolvedType: 'COLOR' });
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(variable);

			await applyCssVarSyntaxToVariables({ overwriteExisting: false });

			expect(variable.setVariableCodeSyntax).toHaveBeenCalledWith('WEB', 'var(--wp--custom--color--brand)');
		});

		it('generates --token-- for !-usa collection variables', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				mockCollection({ name: '!-usa' }),
			]);
			const variable = mockVariable({ name: 'color/blue/5v', resolvedType: 'COLOR' });
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(variable);

			await applyCssVarSyntaxToVariables({ overwriteExisting: false });

			expect(variable.setVariableCodeSyntax).toHaveBeenCalledWith('WEB', 'var(--token--color--blue-5v)');
		});

		it('falls back to --wp--custom-- for unrecognized collections', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([
				mockCollection({ name: 'some-library' }),
			]);
			const variable = mockVariable({ name: 'color/brand', resolvedType: 'COLOR' });
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(variable);

			await applyCssVarSyntaxToVariables({ overwriteExisting: false });

			expect(variable.setVariableCodeSyntax).toHaveBeenCalledWith('WEB', 'var(--wp--custom--color--brand)');
		});

		// --- overwriteExisting flag ---

		it('skips variables that already have CSS var syntax when overwriteExisting is false', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([mockCollection()]);
			const variable = mockVariable({
				codeSyntax: { WEB: 'var(--wp--preset--color--primary)' },
			});
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(variable);

			const result = await applyCssVarSyntaxToVariables({ overwriteExisting: false });

			expect(variable.setVariableCodeSyntax).not.toHaveBeenCalled();
			expect(result).toEqual({ updatedCount: 0, skippedCount: 1, totalProcessed: 1 });
		});

		it('overwrites existing CSS var syntax when overwriteExisting is true', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([mockCollection()]);
			const variable = mockVariable({
				codeSyntax: { WEB: 'var(--wp--custom--color--primary)' },
			});
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(variable);

			const result = await applyCssVarSyntaxToVariables({ overwriteExisting: true });

			expect(variable.setVariableCodeSyntax).toHaveBeenCalledWith('WEB', 'var(--wp--preset--color--primary)');
			expect(result).toEqual({ updatedCount: 1, skippedCount: 0, totalProcessed: 1 });
		});

		// --- Edge cases ---

		it('handles null variables gracefully', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([mockCollection()]);
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(null);

			const result = await applyCssVarSyntaxToVariables({ overwriteExisting: false });

			expect(result).toEqual({ updatedCount: 0, skippedCount: 0, totalProcessed: 0 });
		});

		it('handles setVariableCodeSyntax errors gracefully', async () => {
			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue([mockCollection()]);
			const variable = mockVariable();
			variable.setVariableCodeSyntax.mockImplementation(() => { throw new Error('Mock error'); });
			mockFigma.variables.getVariableByIdAsync.mockResolvedValue(variable);

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const result = await applyCssVarSyntaxToVariables({ overwriteExisting: false });

			expect(consoleSpy).toHaveBeenCalledWith('Error updating variable palette/primary:', expect.any(Error));
			expect(result).toEqual({ updatedCount: 0, skippedCount: 0, totalProcessed: 0 });

			consoleSpy.mockRestore();
		});

		it('handles multiple collections and variables, tracking counts correctly', async () => {
			const collections = [
				mockCollection({ name: 'settings [color]', variableIds: ['v1'] }),
				mockCollection({ name: 'settings [fluid]', variableIds: ['v2', 'v3'] }),
			];
			const variables = [
				mockVariable({ name: 'palette/primary' }),
				mockVariable({ name: 'font-size/xl', resolvedType: 'FLOAT' }),
				mockVariable({ name: 'font-size/lg', resolvedType: 'FLOAT', codeSyntax: { WEB: 'var(--wp--preset--font-size--lg)' } }),
			];

			mockFigma.variables.getLocalVariableCollectionsAsync.mockResolvedValue(collections);
			mockFigma.variables.getVariableByIdAsync
				.mockResolvedValueOnce(variables[0])
				.mockResolvedValueOnce(variables[1])
				.mockResolvedValueOnce(variables[2]);

			const result = await applyCssVarSyntaxToVariables({ overwriteExisting: false });

			expect(variables[0].setVariableCodeSyntax).toHaveBeenCalledWith('WEB', 'var(--wp--preset--color--primary)');
			expect(variables[1].setVariableCodeSyntax).toHaveBeenCalledWith('WEB', 'var(--wp--preset--font-size--xl)');
			expect(variables[2].setVariableCodeSyntax).not.toHaveBeenCalled();
			expect(result).toEqual({ updatedCount: 2, skippedCount: 1, totalProcessed: 3 });
		});
	});
});
