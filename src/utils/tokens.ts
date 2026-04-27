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

// Returns true when the var path matches typography/fontFamilies/{slug} (any casing/hyphenation).
// Requires at least 3 segments so typography/fontFamilies (no slug) is not mis-resolved.
function isFontFamilyPath(parts: string[]): boolean {
	if (parts.length < 3) return false;
	const first = parts[0].toLowerCase();
	const second = parts[1] ? parts[1].replace(/-/g, '').toLowerCase() : '';
	return first === 'typography' && second.includes('fontfamil');
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
		const slug = varLower.split('/').pop()!;
		return `var(--wp--preset--color--${slug})`;
	}

	if (col === 'settings [custom color]') {
		// Use the full path (minus optional leading "custom/") so the CSS var matches the exported key
		const parts = varName.split('/');
		const stripped = parts[0].toLowerCase() === 'custom' ? parts.slice(1) : parts;
		return `var(--wp--custom--${normalizeVarPath(stripped.join('/'))})`;
	}

	if (col === 'settings [static]') {
		const parts = varName.split('/');
		const category = normalizeCssSegment(parts[0]);
		const group = normalizeCssSegment(parts[1] || '');
		const slug = normalizeCssSegment(parts[parts.length - 1]);
		if (category === 'border' && group === 'radius-sizes') {
			return `var(--wp--preset--border-radius--${slug})`;
		}
	}

	if (col === 'settings [custom]') {
		// Strip leading "custom/" prefix if present to avoid double-nesting
		const raw = varName.startsWith('custom/') || varName.startsWith('Custom/')
			? varName.slice(varName.indexOf('/') + 1)
			: varName;
		const parts = raw.split('/');
		if (isFontFamilyPath(parts)) {
			return `var(--wp--preset--font-family--${normalizeCssSegment(parts[parts.length - 1])})`;
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

	// Fallback: detect font-family pattern regardless of collection (e.g. library collections)
	if (isFontFamilyPath(varName.split('/'))) {
		return `var(--wp--preset--font-family--${normalizeCssSegment(varName.split('/').pop()!)})`;
	}

	return `var(--wp--custom--${normalizeVarPath(varName)})`;
}

export async function resolveAliasToString(variableId: string, collectionsMap: Map<string, string>): Promise<string | null> {
	const targetVar = await figma.variables.getVariableByIdAsync(variableId);
	if (!targetVar) return null;
	let collectionName = collectionsMap.get(targetVar.variableCollectionId);
	if (!collectionName) {
		// Variable is from a library collection — fetch and cache it
		const collection = await figma.variables.getVariableCollectionByIdAsync(targetVar.variableCollectionId);
		if (!collection) return null;
		collectionName = collection.name;
		collectionsMap.set(targetVar.variableCollectionId, collectionName);
	}
	return transformTokenReference(collectionName, targetVar.name);
}

export async function resolveValue(value: any, resolvedType: string, collectionsMap: Map<string, string>): Promise<string | null> {
	if (isVariableAlias(value)) return resolveAliasToString(value.id, collectionsMap);
	if (resolvedType === 'COLOR') return rgbToHex(value);
	if (resolvedType === 'FLOAT') return typeof value === 'number' ? `${value}px` : null;
	if (resolvedType === 'STRING') return typeof value === 'string' ? value : null;
	return null;
}
