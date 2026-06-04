// --- Types ---

export type FigmaColor = { r: number; g: number; b: number; a: number };

export type ImportEntry = {
	collection: string;
	variableName: string;
	resolvedType: 'COLOR' | 'FLOAT' | 'STRING';
	/** modeName → value (FigmaColor for COLOR, number for FLOAT, string for STRING) */
	modes: Record<string, FigmaColor | number | string>;
};

export type ParseResult = {
	entries: ImportEntry[];
	warnings: string[];
};

export type WriteResult = {
	created: number;
	updated: number;
	skipped: number;
	warnings: string[];
};

// --- Value parsers ---

/** Parse any CSS color string to Figma RGBA. Returns null for CSS var references. */
export function parseColor(value: string): FigmaColor | null {
	if (!value || typeof value !== 'string') return null;
	if (value.startsWith('var(')) return null;

	if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

	// #rrggbb or #rrggbbaa
	const hex = value.match(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
	if (hex) {
		const r = parseInt(hex[1].slice(0, 2), 16) / 255;
		const g = parseInt(hex[1].slice(2, 4), 16) / 255;
		const b = parseInt(hex[1].slice(4, 6), 16) / 255;
		const a = hex[2] ? parseInt(hex[2], 16) / 255 : 1;
		return { r, g, b, a };
	}

	// rgba(r, g, b, a) or rgb(r, g, b)
	const rgba = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/);
	if (rgba) {
		return {
			r: parseInt(rgba[1]) / 255,
			g: parseInt(rgba[2]) / 255,
			b: parseInt(rgba[3]) / 255,
			a: rgba[4] !== undefined ? parseFloat(rgba[4]) : 1,
		};
	}

	return null;
}

/** Strip 'px' unit and return the number, or null if not parseable. */
export function parsePx(value: string | undefined): number | null {
	if (!value || typeof value !== 'string') return null;
	const m = value.match(/^([\d.]+)px$/);
	return m ? parseFloat(m[1]) : null;
}

/** Parse min(Xrem, Yvw) spacing syntax → { desktop: px, vw: number }. */
export function parseFluidSpacing(value: string | undefined): { desktop: number; vw: number } | null {
	if (!value) return null;
	const m = value.match(/^min\(([\d.]+)rem,\s*([\d.]+)vw\)$/);
	if (!m) return null;
	const rem = parseFloat(m[1]);
	const vw = parseFloat(m[2]);
	return { desktop: Math.round(rem * 16 * 10000) / 10000, vw };
}

/**
 * Determine whether a string value from settings.custom or styles should be
 * stored as a FLOAT (px values) or STRING.
 */
export function parseCustomValue(value: string): { resolvedType: 'FLOAT' | 'STRING'; parsedValue: number | string } {
	const px = parsePx(value);
	if (px !== null) return { resolvedType: 'FLOAT', parsedValue: px };
	return { resolvedType: 'STRING', parsedValue: value };
}

// --- Nested object flattener for custom / styles ---

function flattenToEntries(
	obj: any,
	path: string[],
	collection: string,
	entries: ImportEntry[],
	warnings: string[],
): void {
	for (const key of Object.keys(obj)) {
		const val = obj[key];
		const currentPath = [...path, key];
		if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
			flattenToEntries(val, currentPath, collection, entries, warnings);
		} else if (typeof val === 'string') {
			const { resolvedType, parsedValue } = parseCustomValue(val);
			entries.push({
				collection,
				variableName: currentPath.join('/'),
				resolvedType,
				modes: { Default: parsedValue },
			});
		} else if (typeof val === 'number') {
			entries.push({
				collection,
				variableName: currentPath.join('/'),
				resolvedType: 'FLOAT',
				modes: { Default: val },
			});
		} else {
			warnings.push(`${collection}: Skipping "${currentPath.join('/')}" — unsupported value type (${typeof val}).`);
		}
	}
}

// --- Main parser ---

export function parseThemeJson(theme: any): ParseResult {
	const entries: ImportEntry[] = [];
	const warnings: string[] = [];

	if (!theme || typeof theme !== 'object') {
		warnings.push('Invalid theme.json — expected a JSON object.');
		return { entries, warnings };
	}

	// --- settings [color] ---
	const palette = theme.settings?.color?.palette;
	if (Array.isArray(palette)) {
		for (const item of palette) {
			const color = parseColor(item.color);
			if (color) {
				entries.push({
					collection: 'settings [color]',
					variableName: `palette/${item.slug}`,
					resolvedType: 'COLOR',
					modes: { Default: color },
				});
			} else {
				warnings.push(
					`settings [color]: Could not parse color "${item.color}" for slug "${item.slug}" — skipped.` +
					(item.color?.startsWith('var(') ? ' (CSS variable references cannot be imported as colors.)' : '')
				);
			}
		}
	}

	// --- settings [fluid]: font sizes ---
	const fontSizes = theme.settings?.typography?.fontSizes;
	if (Array.isArray(fontSizes)) {
		for (const item of fontSizes) {
			const desktop = parsePx(item.fluid?.max ?? item.size);
			const mobile = parsePx(item.fluid?.min);
			if (desktop === null) {
				warnings.push(`settings [fluid]: Could not parse font size for slug "${item.slug}" — skipped.`);
				continue;
			}
			const modes: Record<string, number> = { Desktop: desktop };
			if (mobile !== null) modes.Mobile = mobile;
			entries.push({
				collection: 'settings [fluid]',
				variableName: `font-size/${item.slug}`,
				resolvedType: 'FLOAT',
				modes,
			});
		}
	}

	// --- settings [fluid]: spacing sizes ---
	const spacingSizes = theme.settings?.spacing?.spacingSizes;
	if (Array.isArray(spacingSizes)) {
		for (const item of spacingSizes) {
			const parsed = parseFluidSpacing(item.size);
			if (!parsed) {
				warnings.push(`settings [fluid]: Could not parse spacing size "${item.size}" for slug "${item.slug}" — skipped.`);
				continue;
			}
			entries.push({
				collection: 'settings [fluid]',
				variableName: `spacing/${item.slug}`,
				resolvedType: 'FLOAT',
				modes: { Desktop: parsed.desktop, vw: parsed.vw },
			});
		}
	}

	// --- settings [static]: border/radius-sizes ---
	const radiusSizes = theme.settings?.border?.radiusSizes;
	if (Array.isArray(radiusSizes)) {
		for (const item of radiusSizes) {
			const value = parsePx(item.size);
			if (value === null) {
				warnings.push(`settings [static]: Could not parse border radius "${item.size}" for slug "${item.slug}" — skipped.`);
				continue;
			}
			entries.push({
				collection: 'settings [static]',
				variableName: `border/radius-sizes/${item.slug}`,
				resolvedType: 'FLOAT',
				modes: { Default: value },
			});
		}
	}

	// --- settings [static]: dimensions/aspect-ratios ---
	const aspectRatios = theme.settings?.dimensions?.aspectRatios;
	if (Array.isArray(aspectRatios)) {
		for (const item of aspectRatios) {
			entries.push({
				collection: 'settings [static]',
				variableName: `dimensions/aspect-ratios/${item.slug}`,
				resolvedType: 'STRING',
				modes: { Default: String(item.ratio) },
			});
		}
	}

	// --- settings [static]: shadow/presets ---
	const shadowPresets = theme.settings?.shadow?.presets;
	if (Array.isArray(shadowPresets)) {
		for (const item of shadowPresets) {
			entries.push({
				collection: 'settings [static]',
				variableName: `shadow/presets/${item.slug}`,
				resolvedType: 'STRING',
				modes: { Default: String(item.shadow) },
			});
		}
	}

	// --- settings [custom] ---
	const custom = theme.settings?.custom;
	if (custom && typeof custom === 'object' && !Array.isArray(custom)) {
		flattenToEntries(custom, [], 'settings [custom]', entries, warnings);
	}

	// --- styles ---
	const styles = theme.styles;
	if (styles && typeof styles === 'object' && !Array.isArray(styles)) {
		flattenToEntries(styles, [], 'styles', entries, warnings);
	}

	if (entries.length === 0 && warnings.length === 0) {
		warnings.push('No importable sections found in theme.json. Expected: settings.color.palette, settings.typography.fontSizes, settings.spacing.spacingSizes, settings.border.radiusSizes, settings.custom, styles.');
	}

	return { entries, warnings };
}

// --- Figma writer ---

const DEFAULT_MODE_NAME = 'Default';

/** Default fallback values when a variable has no value for a given mode. */
function defaultValue(resolvedType: ImportEntry['resolvedType']): FigmaColor | number | string {
	if (resolvedType === 'COLOR') return { r: 0, g: 0, b: 0, a: 1 };
	if (resolvedType === 'FLOAT') return 0;
	return '';
}

export async function writeImportEntries(entries: ImportEntry[]): Promise<WriteResult> {
	const existingCollections = await figma.variables.getLocalVariableCollectionsAsync();
	const collectionByName = new Map<string, any>();
	for (const col of existingCollections) {
		collectionByName.set(col.name.toLowerCase(), col);
	}

	let created = 0;
	let updated = 0;
	let skipped = 0;
	const warnings: string[] = [];

	// Group entries by collection
	const byCollection = new Map<string, ImportEntry[]>();
	for (const entry of entries) {
		const key = entry.collection;
		if (!byCollection.has(key)) byCollection.set(key, []);
		byCollection.get(key)!.push(entry);
	}

	for (const [collectionName, collectionEntries] of byCollection) {
		// --- Get or create collection ---
		let collection = collectionByName.get(collectionName.toLowerCase());
		let isNewCollection = false;
		if (!collection) {
			collection = figma.variables.createVariableCollection(collectionName);
			isNewCollection = true;
		}

		// --- Ensure required modes exist ---
		const requiredModeNames = new Set<string>();
		for (const entry of collectionEntries) {
			for (const modeName of Object.keys(entry.modes)) {
				requiredModeNames.add(modeName);
			}
		}

		// Build current mode map (name → modeId)
		const refreshModeMap = () =>
			new Map<string, string>(collection.modes.map((m: any) => [m.name.toLowerCase(), m.modeId]));

		let modeMap = refreshModeMap();

		for (const modeName of requiredModeNames) {
			if (!modeMap.has(modeName.toLowerCase())) {
				if (isNewCollection && modeMap.size === 1) {
					// Rename the default "Mode 1" rather than adding a new one
					const [firstModeId] = modeMap.values();
					collection.renameMode(firstModeId, modeName);
					isNewCollection = false; // only rename once
				} else {
					collection.addMode(modeName);
				}
				modeMap = refreshModeMap();
			}
		}

		// If collection was just created and still has the original "Mode 1" name
		// (happens when no modes were added), rename it to Default
		if (modeMap.has('mode 1')) {
			const modeId = modeMap.get('mode 1')!;
			collection.renameMode(modeId, DEFAULT_MODE_NAME);
			modeMap = refreshModeMap();
		}

		// --- Build existing variable map (name → variable) ---
		const existingVars = new Map<string, any>();
		for (const varId of collection.variableIds) {
			const v = await figma.variables.getVariableByIdAsync(varId);
			if (v) existingVars.set(v.name, v);
		}

		// --- Create or update each variable ---
		for (const entry of collectionEntries) {
			let variable = existingVars.get(entry.variableName);
			const isNew = !variable;

			if (isNew) {
				try {
					variable = figma.variables.createVariable(entry.variableName, collection, entry.resolvedType);
				} catch (err) {
					warnings.push(`Could not create variable "${entry.variableName}": ${err instanceof Error ? err.message : String(err)}`);
					skipped++;
					continue;
				}
			} else if (variable.resolvedType !== entry.resolvedType) {
				warnings.push(`Skipping "${entry.variableName}" — existing variable type (${variable.resolvedType}) does not match import type (${entry.resolvedType}).`);
				skipped++;
				continue;
			}

			// Set value for each mode
			let anySet = false;
			for (const [modeName, value] of Object.entries(entry.modes)) {
				const modeId = modeMap.get(modeName.toLowerCase());
				if (!modeId) {
					warnings.push(`Mode "${modeName}" not found in collection "${collectionName}" for variable "${entry.variableName}".`);
					continue;
				}
				try {
					variable.setValueForMode(modeId, value);
					anySet = true;
				} catch (err) {
					warnings.push(`Could not set "${entry.variableName}" [${modeName}]: ${err instanceof Error ? err.message : String(err)}`);
				}
			}

			// Fill any modes that have no value with a safe default
			for (const [lowerName, modeId] of modeMap) {
				const hasValue = Object.keys(entry.modes).some(m => m.toLowerCase() === lowerName);
				if (!hasValue) {
					try {
						variable.setValueForMode(modeId, defaultValue(entry.resolvedType));
					} catch (_) {
						// best-effort; don't warn for default fills
					}
				}
			}

			if (isNew) { created++; } else if (anySet) { updated++; }
		}
	}

	return { created, updated, skipped, warnings };
}
