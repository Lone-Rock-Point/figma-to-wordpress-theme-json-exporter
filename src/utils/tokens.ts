import { isVariableAlias } from './index';
import { rgbToHex } from './color';

export function transformTokenReference(collectionName: string, varName: string): string {
	const col = collectionName.toLowerCase().trim();

	if (col.startsWith('!-usa')) {
		// collection "!-usa", varName "color/blue/5v" → "var(--token--color--blue-5v)"
		const parts = varName.split('/');
		const category = parts[0].toLowerCase();
		const rest = parts.slice(1).map(p => p.toLowerCase()).join('-');
		return `var(--token--${category}--${rest})`;
	}

	if (col.startsWith('!-theme')) {
		// collection "!-theme-tokens", varName "theme/color/accent-warm-lighter" → "var(--theme--color--accent-warm-lighter)"
		const cssPath = varName.toLowerCase().replace(/\//g, '--');
		return `var(--${cssPath})`;
	}

	// Fallback: wp--custom-- reference
	return `var(--wp--custom--${varName.toLowerCase().replace(/\//g, '--')})`;
}

export async function resolveAliasToString(variableId: string, collectionsMap: Map<string, string>): Promise<string | null> {
	const targetVar = await figma.variables.getVariableByIdAsync(variableId);
	if (!targetVar) return null;
	const collectionName = collectionsMap.get(targetVar.variableCollectionId);
	if (!collectionName) return null;
	return transformTokenReference(collectionName, targetVar.name);
}

export async function resolveValue(value: any, resolvedType: string, collectionsMap: Map<string, string>): Promise<string | number | null> {
	if (isVariableAlias(value)) return resolveAliasToString(value.id, collectionsMap);
	if (resolvedType === 'COLOR') return rgbToHex(value);
	if (resolvedType === 'FLOAT') return typeof value === 'number' ? value : null;
	if (resolvedType === 'STRING') return typeof value === 'string' ? value : null;
	return null;
}
