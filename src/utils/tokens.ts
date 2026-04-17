import { isVariableAlias } from './index';
import { rgbToHex } from './color';

export function transformTokenReference(collectionName: string, varName: string): string {
	const col = collectionName.toLowerCase().trim();
	const varLower = varName.toLowerCase();

	// !-usa: check collection name OR variable name prefix
	if (col.startsWith('!-usa') || varLower.startsWith('!-usa/')) {
		const path = varLower.startsWith('!-usa/') ? varLower.slice('!-usa/'.length) : varLower;
		const parts = path.split('/');
		const category = parts[0];
		const rest = parts.slice(1).join('-');
		return `var(--token--${category}--${rest})`;
	}

	// !-theme: check collection name OR variable name prefix
	if (col.startsWith('!-theme') || varLower.startsWith('!-theme')) {
		const path = varLower.replace(/^!-theme[^/]*\//, '').replace(/\//g, '--');
		return `var(--${path})`;
	}

	if (col === 'settings [color]') {
		const parts = varLower.split('/');
		const slug = parts[parts.length - 1];
		return `var(--wp--preset--color--${slug})`;
	}

	if (col === 'settings [custom color]') {
		const parts = varLower.split('/');
		const slug = parts[parts.length - 1];
		return `var(--wp--custom--color--${slug})`;
	}

	if (col === 'settings [custom]') {
		// Strip leading "custom/" prefix if present to avoid double-nesting
		const path = varLower.startsWith('custom/') ? varLower.slice('custom/'.length) : varLower;
		return `var(--wp--custom--${path.replace(/\//g, '--')})`;
	}

	if (col === 'settings [fluid]') {
		const parts = varLower.split('/');
		const group = parts[0];
		const slug = parts[parts.length - 1];
		if (group.includes('font') || group.includes('type') || group === 'typography') {
			return `var(--wp--preset--font-size--${slug})`;
		}
		if (group.includes('spacing') || group.includes('space')) {
			return `var(--wp--preset--spacing--${slug})`;
		}
	}

	// Fallback: wp--custom-- reference
	return `var(--wp--custom--${varLower.replace(/\//g, '--')})`;
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
