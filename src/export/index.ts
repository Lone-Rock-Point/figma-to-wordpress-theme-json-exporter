import { ExportOptions } from '../types';
import { isVariableAlias } from '../utils/index';
import { resolveAliasToString, resolveValue } from '../utils/tokens';
import { rgbToHex } from '../utils/color';

// --- Shared helpers ---

function toTitleCase(str: string): string {
	return str.split(/[-_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function setNestedValue(obj: Record<string, any>, path: string[], value: any): void {
	if (path.length === 0) return;
	if (path.length === 1) { obj[path[0]] = value; return; }
	const key = path[0];
	if (!obj[key] || typeof obj[key] !== 'object' || Array.isArray(obj[key])) obj[key] = {};
	setNestedValue(obj[key], path.slice(1), value);
}

function shouldSkip(name: string): boolean {
	return name.split('/').some(p => p.startsWith('*'));
}

// --- settings [color] → settings.color.palette ---

async function handleColorCollection(collection: any, theme: any, collectionsMap: Map<string, string>): Promise<void> {
	const mode = collection.modes[0];
	const palette: Array<{ slug: string; name: string; color: string }> = [];

	for (const variableId of collection.variableIds) {
		const variable = await figma.variables.getVariableByIdAsync(variableId);
		if (!variable) continue;
		const { name, resolvedType, valuesByMode } = variable;
		if (shouldSkip(name)) continue;
		const value = valuesByMode[mode.modeId];
		if (value === undefined) continue;

		// Use only the last path segment for slug and name
		const nameParts = name.split('/');
		const lastPart = nameParts[nameParts.length - 1];
		const slug = lastPart.toLowerCase();
		const displayName = toTitleCase(lastPart);

		let color: string | null = null;
		if (isVariableAlias(value)) {
			color = await resolveAliasToString((value as any).id, collectionsMap);
		} else if (resolvedType === 'COLOR') {
			color = rgbToHex(value);
		} else if (resolvedType === 'STRING' && typeof value === 'string') {
			color = value;
		}

		if (color) palette.push({ slug, name: displayName, color });
	}

	if (palette.length > 0) {
		theme.settings = theme.settings || {};
		theme.settings.color = theme.settings.color || {};
		theme.settings.color.palette = palette;
	}
}

// --- settings [fluid] → settings.typography.font-sizes + settings.spacing.spacing-sizes ---

async function handleFluidCollection(collection: any, theme: any): Promise<void> {
	const desktopMode = collection.modes.find((m: any) => m.name.toLowerCase() === 'desktop');
	const mobileMode = collection.modes.find((m: any) => m.name.toLowerCase() === 'mobile');
	const vwMode = collection.modes.find((m: any) => m.name.toLowerCase() === 'vw');

	if (!desktopMode) return;

	const fontSizes: any[] = [];
	const spacingSizes: any[] = [];

	for (const variableId of collection.variableIds) {
		const variable = await figma.variables.getVariableByIdAsync(variableId);
		if (!variable) continue;
		const { name, resolvedType, valuesByMode } = variable;
		if (shouldSkip(name)) continue;
		if (resolvedType !== 'FLOAT') continue;

		const nameParts = name.split('/');
		const group = nameParts[0].toLowerCase();
		const lastPart = nameParts[nameParts.length - 1];

		const desktopVal = valuesByMode[desktopMode.modeId];
		if (typeof desktopVal !== 'number') continue;

		const isTypography = group.includes('font') || group.includes('type');
		const isSpacing = group.includes('spacing') || group.includes('space');

		if (isTypography && mobileMode) {
			const mobileVal = valuesByMode[mobileMode.modeId];
			if (typeof mobileVal !== 'number') continue;
			fontSizes.push({
				slug: lastPart.toLowerCase(),
				name: toTitleCase(lastPart),
				size: `${desktopVal}px`,
				fluid: { min: `${mobileVal}px`, max: `${desktopVal}px` },
			});
		} else if (isSpacing && vwMode) {
			const vwVal = valuesByMode[vwMode.modeId];
			if (typeof vwVal !== 'number') continue;
			const rem = Math.round((desktopVal / 16) * 10000) / 10000;
			spacingSizes.push({
				slug: lastPart.toLowerCase(),
				name: lastPart,
				size: `min(${rem}rem, ${vwVal}vw)`,
			});
		}
	}

	theme.settings = theme.settings || {};
	if (fontSizes.length > 0) {
		theme.settings.typography = theme.settings.typography || {};
		theme.settings.typography['font-sizes'] = fontSizes;
	}
	if (spacingSizes.length > 0) {
		theme.settings.spacing = theme.settings.spacing || {};
		theme.settings.spacing['spacing-sizes'] = spacingSizes;
	}
}

// --- settings [static] → settings.border, dimensions, layout, shadow ---

const ASPECT_RATIO_NAMES: Record<string, string> = {
	'1': 'Square', '1-1': 'Square',
	'4-3': 'Standard', '3-4': 'Portrait',
	'16-9': 'Wide', '9-16': 'Tall',
	'3-2': 'Photo', '2-3': 'Portrait Photo',
	'21-9': 'Ultrawide',
};

const ARRAY_SETTINGS: Record<string, { settingsPath: string[]; valueKey: string; formatValue?: (v: any) => string }> = {
	'border/radius-sizes': {
		settingsPath: ['border', 'radius-sizes'],
		valueKey: 'size',
		formatValue: (v: number) => `${v}px`,
	},
	'dimensions/aspect-ratios': {
		settingsPath: ['dimensions', 'aspect-ratios'],
		valueKey: 'ratio',
	},
	'shadow/presets': {
		settingsPath: ['shadow', 'presets'],
		valueKey: 'shadow',
	},
};

async function handleStaticCollection(collection: any, theme: any, collectionsMap: Map<string, string>): Promise<void> {
	const mode = collection.modes[0];
	const arrayAccumulator: Record<string, any[]> = {};

	for (const variableId of collection.variableIds) {
		const variable = await figma.variables.getVariableByIdAsync(variableId);
		if (!variable) continue;
		const { name, resolvedType, valuesByMode } = variable;
		if (shouldSkip(name)) continue;
		const value = valuesByMode[mode.modeId];
		if (value === undefined) continue;

		const nameParts = name.split('/');
		const prefix = nameParts.slice(0, 2).join('/').toLowerCase();
		const arrayConfig = ARRAY_SETTINGS[prefix];

		if (arrayConfig && nameParts.length >= 3) {
			const slug = nameParts[2].toLowerCase();

			let resolvedVal: any = null;
			if (resolvedType === 'FLOAT' && typeof value === 'number') {
				resolvedVal = arrayConfig.formatValue ? arrayConfig.formatValue(value) : value;
			} else if (resolvedType === 'STRING' && typeof value === 'string') {
				resolvedVal = value;
			} else if (isVariableAlias(value)) {
				resolvedVal = await resolveAliasToString((value as any).id, collectionsMap);
			}
			if (resolvedVal === null) continue;

			const itemName = prefix.includes('aspect-ratios')
				? (ASPECT_RATIO_NAMES[slug] || toTitleCase(slug.replace(/-/g, ':')))
				: toTitleCase(slug);

			arrayAccumulator[prefix] = arrayAccumulator[prefix] || [];
			arrayAccumulator[prefix].push({ slug, name: itemName, [arrayConfig.valueKey]: resolvedVal });

		} else if (nameParts.length === 2) {
			const normalizedPath = nameParts.map(p => p.toLowerCase()).join('/');
			if (nameParts[0].toLowerCase() === 'typography') continue;

			let resolvedVal: any = null;
			if (resolvedType === 'FLOAT' && typeof value === 'number') {
				resolvedVal = `${value}px`;
			} else if (resolvedType === 'STRING' && typeof value === 'string') {
				resolvedVal = value;
			} else if (isVariableAlias(value)) {
				resolvedVal = await resolveAliasToString((value as any).id, collectionsMap);
			}
			if (resolvedVal === null) continue;

			// Use raw lowercased path segments (preserve kebab-case as-is)
			const category = nameParts[0].toLowerCase();
			const key = nameParts[1].toLowerCase();
			theme.settings = theme.settings || {};
			theme.settings[category] = theme.settings[category] || {};
			theme.settings[category][key] = resolvedVal;
		}
	}

	for (const prefix of Object.keys(arrayAccumulator)) {
		const items = arrayAccumulator[prefix];
		if (!items.length) continue;
		theme.settings = theme.settings || {};
		setNestedValue(theme.settings, ARRAY_SETTINGS[prefix].settingsPath, items);
	}
}

// --- settings [custom color] + settings [custom] → settings.custom.* ---

async function handleCustomCollection(collection: any, theme: any, collectionsMap: Map<string, string>): Promise<void> {
	const mode = collection.modes[0];

	for (const variableId of collection.variableIds) {
		const variable = await figma.variables.getVariableByIdAsync(variableId);
		if (!variable) continue;
		const { name, resolvedType, valuesByMode } = variable;
		if (shouldSkip(name)) continue;
		const value = valuesByMode[mode.modeId];
		if (value === undefined) continue;

		const resolved = await resolveValue(value, resolvedType, collectionsMap);
		if (resolved === null) continue;

		theme.settings = theme.settings || {};
		theme.settings.custom = theme.settings.custom || {};
		setNestedValue(theme.settings.custom, name.split('/'), resolved);
	}
}

// --- styles → styles.* ---

async function handleStylesCollection(collection: any, theme: any, collectionsMap: Map<string, string>): Promise<void> {
	const mode = collection.modes[0];

	for (const variableId of collection.variableIds) {
		const variable = await figma.variables.getVariableByIdAsync(variableId);
		if (!variable) continue;
		const { name, resolvedType, valuesByMode } = variable;
		if (shouldSkip(name)) continue;
		const value = valuesByMode[mode.modeId];
		if (value === undefined) continue;

		const resolved = await resolveValue(value, resolvedType, collectionsMap);
		if (resolved === null) continue;

		theme.styles = theme.styles || {};
		setNestedValue(theme.styles, name.split('/'), resolved);
	}
}

// --- Collection router ---

export async function exportToJSON(options: ExportOptions = {}) {
	const collections = await figma.variables.getLocalVariableCollectionsAsync();

	const collectionsMap = new Map<string, string>();
	for (const col of collections) {
		collectionsMap.set(col.id, col.name);
	}

	const theme = options.baseTheme || {
		'$schema': 'https://schemas.wp.org/trunk/theme.json',
		version: 3,
		settings: { custom: {} },
	};

	for (const collection of collections) {
		const name = collection.name.toLowerCase().trim();
		if (name === 'settings [color]') {
			await handleColorCollection(collection, theme, collectionsMap);
		} else if (name === 'settings [fluid]') {
			await handleFluidCollection(collection, theme);
		} else if (name === 'settings [static]') {
			await handleStaticCollection(collection, theme, collectionsMap);
		} else if (name === 'settings [custom color]' || name === 'settings [custom]') {
			await handleCustomCollection(collection, theme, collectionsMap);
		} else if (name === 'styles') {
			await handleStylesCollection(collection, theme, collectionsMap);
		}
	}

	figma.ui.postMessage({
		type: 'EXPORT_RESULT',
		files: [{ fileName: 'theme.json', body: theme }],
	});
}
