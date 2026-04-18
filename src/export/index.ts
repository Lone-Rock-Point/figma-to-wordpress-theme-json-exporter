import { ExportOptions } from '../types';
import { isVariableAlias } from '../utils/index';
import { resolveAliasToString, resolveValue } from '../utils/tokens';
import { rgbToHex } from '../utils/color';

// --- Shared helpers ---

function toTitleCase(str: string): string {
	return str.split(/[-_]+/).map(w => {
		if (w.toLowerCase() === 'xx') return 'XX';
		return w.charAt(0).toUpperCase() + w.slice(1);
	}).join(' ');
}

function setNestedValue(obj: Record<string, any>, path: string[], value: any): void {
	if (path.length === 0) return;
	if (path.length === 1) { obj[path[0]] = value; return; }
	const key = path[0];
	if (!obj[key] || typeof obj[key] !== 'object' || Array.isArray(obj[key])) obj[key] = {};
	setNestedValue(obj[key], path.slice(1), value);
}

function shouldSkip(name: string): boolean {
	return name.split('/').some(p => p.includes('*'));
}

// Fetch all variables in a collection in parallel
async function fetchVariables(collection: any): Promise<any[]> {
	return (await Promise.all(
		collection.variableIds.map((id: string) => figma.variables.getVariableByIdAsync(id))
	)).filter(Boolean) as any[];
}

// --- settings [color] → settings.color.palette ---

async function handleColorCollection(collection: any, theme: any, collectionsMap: Map<string, string>): Promise<void> {
	const mode = collection.modes[0];
	if (!mode) return;

	const variables = await fetchVariables(collection);

	const palette = (await Promise.all(variables.map(async variable => {
		const { name, resolvedType, valuesByMode } = variable;
		if (shouldSkip(name)) return null;
		const value = valuesByMode[mode.modeId];
		if (value === undefined) return null;

		const lastPart = name.split('/').pop()!;
		let color: string | null = null;
		if (isVariableAlias(value)) {
			color = await resolveAliasToString(value.id, collectionsMap);
		} else if (resolvedType === 'COLOR') {
			color = rgbToHex(value);
		} else if (resolvedType === 'STRING' && typeof value === 'string') {
			color = value;
		}
		return color ? { slug: lastPart.toLowerCase(), name: toTitleCase(lastPart), color } : null;
	}))).filter(Boolean) as Array<{ slug: string; name: string; color: string }>;

	if (palette.length > 0) {
		theme.settings = theme.settings || {};
		theme.settings.color = theme.settings.color || {};
		theme.settings.color.palette = palette;
	}
}

// --- settings [fluid] → settings.typography.fontSizes + settings.spacing.spacingSizes ---

async function handleFluidCollection(collection: any, theme: any): Promise<void> {
	const desktopMode = collection.modes.find((m: any) => m.name.toLowerCase() === 'desktop');
	const mobileMode = collection.modes.find((m: any) => m.name.toLowerCase() === 'mobile');
	const vwMode = collection.modes.find((m: any) => m.name.toLowerCase() === 'vw');

	if (!desktopMode) return;

	const variables = await fetchVariables(collection);

	type FluidEntry = { type: 'font' | 'spacing'; entry: any };

	const results = (await Promise.all(variables.map(async (variable): Promise<FluidEntry | null> => {
		const { name, resolvedType, valuesByMode } = variable;
		if (shouldSkip(name) || resolvedType !== 'FLOAT') return null;

		const nameParts = name.split('/');
		const group = nameParts[0].toLowerCase();
		const lastPart = nameParts[nameParts.length - 1];
		const desktopVal = valuesByMode[desktopMode.modeId];
		if (typeof desktopVal !== 'number') return null;

		const isTypography = group.includes('font') || group.includes('type') || group === 'typography';
		const isSpacing = group.includes('spacing') || group.includes('space');

		if (isTypography && mobileMode) {
			const mobileVal = valuesByMode[mobileMode.modeId];
			if (typeof mobileVal !== 'number') return null;
			return { type: 'font', entry: {
				slug: lastPart.toLowerCase(),
				name: toTitleCase(lastPart),
				size: `${desktopVal}px`,
				fluid: { min: `${mobileVal}px`, max: `${desktopVal}px` },
			}};
		}
		if (isSpacing && vwMode) {
			const vwVal = valuesByMode[vwMode.modeId];
			if (typeof vwVal !== 'number') return null;
			const rem = Math.round((desktopVal / 16) * 10000) / 10000;
			return { type: 'spacing', entry: {
				slug: lastPart.toLowerCase(),
				name: lastPart,
				size: `min(${rem}rem, ${vwVal}vw)`,
			}};
		}
		return null;
	}))).filter(Boolean) as FluidEntry[];

	const fontSizes = results.filter(r => r.type === 'font').map(r => r.entry);
	const spacingSizes = results.filter(r => r.type === 'spacing').map(r => r.entry);

	theme.settings = theme.settings || {};
	if (fontSizes.length > 0) {
		theme.settings.typography = theme.settings.typography || {};
		theme.settings.typography.fontSizes = fontSizes;
	}
	if (spacingSizes.length > 0) {
		theme.settings.spacing = theme.settings.spacing || {};
		theme.settings.spacing.spacingSizes = spacingSizes;
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
		settingsPath: ['border', 'radiusSizes'],
		valueKey: 'size',
		formatValue: (v: number) => `${v}px`,
	},
	'dimensions/aspect-ratios': {
		settingsPath: ['dimensions', 'aspectRatios'],
		valueKey: 'ratio',
	},
	'shadow/presets': {
		settingsPath: ['shadow', 'presets'],
		valueKey: 'shadow',
	},
};

async function handleStaticCollection(collection: any, theme: any, collectionsMap: Map<string, string>): Promise<void> {
	const mode = collection.modes[0];
	if (!mode) return;

	const variables = await fetchVariables(collection);

	type StaticResult =
		| { kind: 'scalar'; category: string; key: string; value: any }
		| { kind: 'array'; prefix: string; slug: string; itemName: string; valueKey: string; value: any };

	const results = (await Promise.all(variables.map(async (variable): Promise<StaticResult | null> => {
		const { name, resolvedType, valuesByMode } = variable;
		if (shouldSkip(name)) return null;
		const value = valuesByMode[mode.modeId];
		if (value === undefined) return null;

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
				resolvedVal = await resolveAliasToString(value.id, collectionsMap);
			}
			if (resolvedVal === null) return null;

			const itemName = prefix.includes('aspect-ratios')
				? (ASPECT_RATIO_NAMES[slug] || toTitleCase(slug.replace(/-/g, ':')))
				: toTitleCase(slug);
			return { kind: 'array', prefix, slug, itemName, valueKey: arrayConfig.valueKey, value: resolvedVal };
		}

		if (nameParts.length === 2 && nameParts[0].toLowerCase() !== 'typography') {
			let resolvedVal: any = null;
			if (resolvedType === 'FLOAT' && typeof value === 'number') {
				resolvedVal = `${value}px`;
			} else if (resolvedType === 'STRING' && typeof value === 'string') {
				resolvedVal = value;
			} else if (isVariableAlias(value)) {
				resolvedVal = await resolveAliasToString(value.id, collectionsMap);
			}
			if (resolvedVal === null) return null;
			// Preserve original casing from Figma variable name (WordPress expects camelCase keys)
			return { kind: 'scalar', category: nameParts[0], key: nameParts[1], value: resolvedVal };
		}

		return null;
	}))).filter(Boolean) as StaticResult[];

	const arrayAccumulator: Record<string, any[]> = {};
	theme.settings = theme.settings || {};

	for (const result of results) {
		if (result.kind === 'scalar') {
			theme.settings[result.category] = theme.settings[result.category] || {};
			theme.settings[result.category][result.key] = result.value;
		} else {
			arrayAccumulator[result.prefix] = arrayAccumulator[result.prefix] || [];
			arrayAccumulator[result.prefix].push({ slug: result.slug, name: result.itemName, [result.valueKey]: result.value });
		}
	}

	for (const prefix of Object.keys(arrayAccumulator)) {
		setNestedValue(theme.settings, ARRAY_SETTINGS[prefix].settingsPath, arrayAccumulator[prefix]);
	}
}

// --- settings [custom color] + settings [custom] → settings.custom.* ---

async function handleCustomCollection(collection: any, theme: any, collectionsMap: Map<string, string>): Promise<void> {
	const mode = collection.modes[0];
	if (!mode) return;

	const variables = await fetchVariables(collection);

	const entries = (await Promise.all(variables.map(async variable => {
		const { name, resolvedType, valuesByMode } = variable;
		if (shouldSkip(name)) return null;
		const value = valuesByMode[mode.modeId];
		if (value === undefined) return null;
		const resolved = await resolveValue(value, resolvedType, collectionsMap);
		if (resolved === null) return null;
		// Strip leading "custom/" segment to avoid settings.custom.custom double-nesting
		const pathParts = name.split('/');
		const path = pathParts[0].toLowerCase() === 'custom' ? pathParts.slice(1) : pathParts;
		return { path, value: resolved };
	}))).filter(Boolean) as Array<{ path: string[]; value: any }>;

	if (entries.length > 0) {
		theme.settings = theme.settings || {};
		theme.settings.custom = theme.settings.custom || {};
		for (const { path, value } of entries) {
			setNestedValue(theme.settings.custom, path, value);
		}
	}
}

// --- styles → styles.* ---

async function handleStylesCollection(collection: any, theme: any, collectionsMap: Map<string, string>): Promise<void> {
	const mode = collection.modes[0];
	if (!mode) return;

	const variables = await fetchVariables(collection);

	const entries = (await Promise.all(variables.map(async variable => {
		const { name, resolvedType, valuesByMode } = variable;
		if (shouldSkip(name)) return null;
		const value = valuesByMode[mode.modeId];
		if (value === undefined) return null;
		const resolved = await resolveValue(value, resolvedType, collectionsMap);
		if (resolved === null) return null;
		return { path: name.split('/'), value: resolved };
	}))).filter(Boolean) as Array<{ path: string[]; value: any }>;

	if (entries.length > 0) {
		theme.styles = theme.styles || {};
		for (const { path, value } of entries) {
			setNestedValue(theme.styles, path, value);
		}
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
