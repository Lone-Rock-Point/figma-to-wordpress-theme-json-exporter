import { transformTokenReference } from './tokens';

/**
 * Checks if a variable's WEB code syntax already contains a CSS var reference.
 * Matches all formats this plugin generates: --wp--preset--, --wp--custom--, --token--, etc.
 */
export function hasCssVarSyntax(description: string): boolean {
	return description.startsWith('var(--');
}

/**
 * Applies the correct WordPress CSS var reference to every variable's WEB code syntax.
 * Uses the same transformTokenReference logic as the theme.json exporter so that
 * Figma's Dev Mode always shows the token that matches what gets exported.
 */
export async function applyCssVarSyntaxToVariables(options: { overwriteExisting: boolean }) {
	const collections = await figma.variables.getLocalVariableCollectionsAsync();
	let updatedCount = 0;
	let skippedCount = 0;

	for (const collection of collections) {
		for (const variableId of collection.variableIds) {
			const variable = await figma.variables.getVariableByIdAsync(variableId);
			if (!variable) continue;

			const currentWebSyntax = variable.codeSyntax?.WEB || '';

			if (hasCssVarSyntax(currentWebSyntax) && !options.overwriteExisting) {
				skippedCount++;
				continue;
			}

			// Derive the CSS var using the same logic as the exporter
			const newCodeSyntax = transformTokenReference(collection.name, variable.name);

			try {
				variable.setVariableCodeSyntax('WEB', newCodeSyntax);
				updatedCount++;
			} catch (error) {
				console.error(`Error updating variable ${variable.name}:`, error);
			}
		}
	}

	return { updatedCount, skippedCount, totalProcessed: updatedCount + skippedCount };
}
