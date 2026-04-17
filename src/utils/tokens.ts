import { isVariableAlias } from './index';
import { rgbToHex } from './color';

// Convert a variable name segment to a CSS var-safe string:
// spaces → hyphens, camelCase → kebab-case, lowercase
function normalizeCssSegment(part: string): string {
	return part
		.trim()
		.replace(/\s+/g, '-')
		.replace(/([A-Z])/g, c => `-${c.toLowerCase()}`)
		.toLowerCase();
}

function normalizeVarPath(path: string): string {
	return path.split('/').map(normalizeCssSegment).join('--');
}

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

	if (col === 'settings [static]') {
		const parts = varName.split('/');
		const prefix = parts.slice(0, 2).join('/').toLowerCase();
		const slug = parts[parts.length - 1].toLowerCase();
		if (prefix === 'border/radius-sizes') {
			return `var(--wp--preset--border-radius--${slug})`;
		}
	}

	if (col === 'settings [custom]') {
		// Strip leading "custom/" prefix if present to avoid double-nesting
		const raw = varName.startsWith('custom/') || varName.startsWith('Custom/')
			? varName.slice(varName.indexOf('/') + 1)
			: varName;
		const parts = raw.split('/');
		const firstLower = parts[0].toLowerCase();
		const secondNorm = parts[1] ? parts[1].replace(/-/g, '').toLowerCase() : '';
		// typography/fontFamilies/{slug} → --wp--preset--typography--font-family--{slug}
		if (firstLower === 'typography' && secondNorm.includes('fontfamil')) {
			return `var(--wp--preset--typography--font-family--${normalizeCssSegment(parts[parts.length - 1])})`;
		}
		return `var(--wp--custom--${normalizeVarPath(raw)})`;
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

	// Fallback: wp--custom-- reference, normalizing spaces and camelCase
	return `var(--wp--custom--${normalizeVarPath(varName)})`;
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
