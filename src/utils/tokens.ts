import { isVariableAlias } from './index';
import { rgbToHex } from './color';

export function transformTokenReference(collectionName: string, varName: string): string {
	const col = collectionName.toLowerCase().trim();

	if (col.startsWith('!-usa')) {
		// "!-usa", varName "color/blue/5v" → "var(--token--color--blue-5v)"
		const parts = varName.split('/');
		const category = parts[0].toLowerCase();
		const rest = parts.slice(1).map(p => p.toLowerCase()).join('-');
		return `var(--token--${category}--${rest})`;
	}

	if (col.startsWith('!-theme')) {
		// "!-theme-tokens", varName "theme/color/accent" → "var(--theme--color--accent)"
		const cssPath = varName.toLowerCase().replace(/\//g, '--');
		return `var(--${cssPath})`;
	}

	if (col === 'settings [color]') {
		// → var(--wp--preset--color--{last-segment})
		const parts = varName.split('/');
		const slug = parts[parts.length - 1].toLowerCase();
		return `var(--wp--preset--color--${slug})`;
	}

	if (col === 'settings [custom color]') {
		// → var(--wp--custom--color--{last-segment})
		const parts = varName.split('/');
		const slug = parts[parts.length - 1].toLowerCase();
		return `var(--wp--custom--color--${slug})`;
	}

	if (col === 'settings [fluid]') {
		// Font size or spacing preset depending on first path segment
		const parts = varName.split('/');
		const group = parts[0].toLowerCase();
		const slug = parts[parts.length - 1].toLowerCase();
		if (group.includes('font') || group.includes('type')) {
			return `var(--wp--preset--font-size--${slug})`;
		}
		if (group.includes('spacing') || group.includes('space')) {
			return `var(--wp--preset--spacing--${slug})`;
		}
	}

	// Fallback: wp--custom-- reference
	return `var(--wp--custom--${varName.toLowerCase().replace(/\//g, '--')})`;
}

export async function resolveAliasToString(variableId: string, collectionsMap: Map<string, string>): Promise<string | null> {
	const targetVar = await figma.variables.getVariableByIdAsync(variableId);
	if (!targetVar) return null;
	let collectionName = collectionsMap.get(targetVar.variableCollectionId);
	if (!collectionName) {
		// Variable is from a library collection — fetch it directly
		const collection = await figma.variables.getVariableCollectionByIdAsync(targetVar.variableCollectionId);
		if (!collection) return null;
		collectionName = collection.name;
	}
	return transformTokenReference(collectionName, targetVar.name);
}

export async function resolveValue(value: any, resolvedType: string, collectionsMap: Map<string, string>): Promise<string | number | null> {
	if (isVariableAlias(value)) return resolveAliasToString(value.id, collectionsMap);
	if (resolvedType === 'COLOR') return rgbToHex(value);
	if (resolvedType === 'FLOAT') return typeof value === 'number' ? value : null;
	if (resolvedType === 'STRING') return typeof value === 'string' ? value : null;
	return null;
}
