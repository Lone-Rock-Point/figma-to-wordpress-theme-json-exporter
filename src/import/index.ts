import { transformTokenReference, resolveAliasToString } from '../utils/tokens';

// --- Types ---

export type FigmaColor = { r: number; g: number; b: number; a: number };

/** A reference to another Figma variable, identified by its original CSS var string. */
export type VarAliasRef = {
	type: 'VAR_ALIAS';
	/** Original CSS var string, e.g. 'var(--token--color--orange-50v)' */
	cssVar: string;
};

export type ImportModeValue = FigmaColor | number | string | VarAliasRef;

export type ImportEntry = {
	collection: string;
	variableName: string;
	resolvedType: 'COLOR' | 'FLOAT' | 'STRING';
	/** modeName → value */
	modes: Record<string, ImportModeValue>;
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
		const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
		return {
			r: clamp01(parseInt(rgba[1]) / 255),
			g: clamp01(parseInt(rgba[2]) / 255),
			b: clamp01(parseInt(rgba[3]) / 255),
			a: clamp01(rgba[4] !== undefined ? parseFloat(rgba[4]) : 1),
		};
	}

	return null;
}

/**
 * Parse a color string or CSS var reference.
 * - Concrete colors (hex, rgb, rgba, transparent) → FigmaColor
 * - CSS var references (var(--token--...), var(--wp--...)) → VarAliasRef
 * - Unparseable values → null
 */
export function parseColorOrAlias(value: string | undefined): FigmaColor | VarAliasRef | null {
	if (!value || typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (trimmed.startsWith('var(')) return { type: 'VAR_ALIAS', cssVar: trimmed };
	return parseColor(trimmed);
}

function isVarAliasRef(v: unknown): v is VarAliasRef {
	return (
		v !== null &&
		typeof v === 'object' &&
		(v as any).type === 'VAR_ALIAS' &&
		typeof (v as any).cssVar === 'string'
	);
}

/**
 * Strip 'px' unit and return the number, or null if not parseable.
 * Rejects multi-dot strings like "1.2.3px".
 */
export function parsePx(value: string | undefined): number | null {
	if (!value || typeof value !== 'string') return null;
	const m = value.trim().match(/^(\d+(?:\.\d+)?)px$/);
	return m ? parseFloat(m[1]) : null;
}

/**
 * Parse min(Xrem, Yvw) spacing syntax → { desktop: px, vw: number }.
 * Tolerates optional whitespace inside the expression.
 */
export function parseFluidSpacing(value: string | undefined): { desktop: number; vw: number } | null {
	if (!value) return null;
	const m = value.trim().match(/^min\(\s*(\d+(?:\.\d+)?)rem\s*,\s*(\d+(?:\.\d+)?)vw\s*\)$/);
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

/**
 * Recursively flatten the settings.custom.color subtree into settings [custom color] entries.
 * Values are parsed as colors (hex, rgb, transparent) or color var aliases. Non-color values
 * are skipped with a warning.
 */
function flattenCustomColorToEntries(
	obj: any,
	path: string[],
	entries: ImportEntry[],
	warnings: string[],
): void {
	for (const key of Object.keys(obj)) {
		const val = obj[key];
		const currentPath = [...path, key];
		if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
			flattenCustomColorToEntries(val, currentPath, entries, warnings);
		} else if (typeof val === 'string') {
			const trimmed = val.trim();
			const colorOrAlias = parseColorOrAlias(trimmed);
			if (colorOrAlias) {
				entries.push({
					collection: 'settings [custom color]',
					variableName: currentPath.join('/'),
					resolvedType: 'COLOR',
					modes: { Default: colorOrAlias },
				});
			} else {
				warnings.push(
					`settings [custom color]: Skipping "${currentPath.join('/')}" — "${trimmed}" is not a valid color or CSS var reference.`
				);
			}
		} else {
			warnings.push(
				`settings [custom color]: Skipping "${currentPath.join('/')}" — unsupported value type (${typeof val}).`
			);
		}
	}
}

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
			const trimmed = val.trim();
			if (trimmed.startsWith('var(')) {
				// CSS var reference — store as VarAliasRef so we can re-link it
				// to a Figma VARIABLE_ALIAS at write time (fallback: literal string).
				entries.push({
					collection,
					variableName: currentPath.join('/'),
					resolvedType: 'STRING',
					modes: { Default: { type: 'VAR_ALIAS', cssVar: trimmed } as VarAliasRef },
				});
			} else {
				const { resolvedType, parsedValue } = parseCustomValue(trimmed);
				entries.push({
					collection,
					variableName: currentPath.join('/'),
					resolvedType,
					modes: { Default: parsedValue },
				});
			}
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
			// Validate required fields before creating an entry
			if (!item.slug || typeof item.slug !== 'string') {
				warnings.push(`settings [color]: Skipping palette entry — missing or invalid slug.`);
				continue;
			}
			const colorOrAlias = parseColorOrAlias(item.color);
			if (colorOrAlias) {
				entries.push({
					collection: 'settings [color]',
					variableName: `color/palette/${item.slug}`,
					resolvedType: 'COLOR',
					modes: { Default: colorOrAlias },
				});
			} else {
				warnings.push(
					`settings [color]: Could not parse color "${item.color}" for slug "${item.slug}" — skipped.`
				);
			}
		}
	}

	// --- settings [fluid]: font sizes ---
	const fontSizes = theme.settings?.typography?.fontSizes;
	if (Array.isArray(fontSizes)) {
		for (const item of fontSizes) {
			if (!item.slug || typeof item.slug !== 'string') {
				warnings.push(`settings [fluid]: Skipping font size entry — missing or invalid slug.`);
				continue;
			}
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
				variableName: `typography/fontSizes/${item.slug}`,
				resolvedType: 'FLOAT',
				modes,
			});
		}
	}

	// --- settings [fluid]: spacing sizes ---
	const spacingSizes = theme.settings?.spacing?.spacingSizes;
	if (Array.isArray(spacingSizes)) {
		for (const item of spacingSizes) {
			if (!item.slug || typeof item.slug !== 'string') {
				warnings.push(`settings [fluid]: Skipping spacing size entry — missing or invalid slug.`);
				continue;
			}
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
			if (!item.slug || typeof item.slug !== 'string') {
				warnings.push(`settings [static]: Skipping border radius entry — missing or invalid slug.`);
				continue;
			}
			const value = parsePx(item.size);
			if (value === null) {
				warnings.push(`settings [static]: Could not parse border radius "${item.size}" for slug "${item.slug}" — skipped.`);
				continue;
			}
			entries.push({
				collection: 'settings [static]',
				variableName: `border/radiusSizes/${item.slug}`,
				resolvedType: 'FLOAT',
				modes: { Default: value },
			});
		}
	}

	// --- settings [static]: dimensions/aspect-ratios ---
	const aspectRatios = theme.settings?.dimensions?.aspectRatios;
	if (Array.isArray(aspectRatios)) {
		for (const item of aspectRatios) {
			if (!item.slug || typeof item.slug !== 'string') {
				warnings.push(`settings [static]: Skipping aspect ratio entry — missing or invalid slug.`);
				continue;
			}
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
			if (!item.slug || typeof item.slug !== 'string') {
				warnings.push(`settings [static]: Skipping shadow preset entry — missing or invalid slug.`);
				continue;
			}
			entries.push({
				collection: 'settings [static]',
				variableName: `shadow/presets/${item.slug}`,
				resolvedType: 'STRING',
				modes: { Default: String(item.shadow) },
			});
		}
	}

	// --- settings [static]: font families (from settings.typography.fontFamilies) ---
	// WordPress stores font family presets in settings.typography.fontFamilies.
	// These go into settings [static] so that transformTokenReference maps them to
	// var(--wp--preset--font-family--{slug}), matching how styles/custom entries
	// reference them via VarAliasRef.
	const fontFamilies = theme.settings?.typography?.fontFamilies;
	if (Array.isArray(fontFamilies)) {
		for (const item of fontFamilies) {
			if (!item.slug || typeof item.slug !== 'string') {
				warnings.push(`settings [static]: Skipping font family entry — missing or invalid slug.`);
				continue;
			}
			if (typeof item.fontFamily === 'string') {
				// Strip the CSS font-family cascade to just the first name
				// e.g. "Montserrat, sans-serif" → "Montserrat"
				const firstName = item.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
				if (firstName) {
					entries.push({
						collection: 'settings [static]',
						variableName: `typography/fontFamilies/${item.slug}`,
						resolvedType: 'STRING',
						modes: { Default: firstName },
					});
				}
			}
		}
	}

	// --- settings [custom color] ---
	// settings.custom.color.* → separate COLOR collection so color swatches get the right type
	// and stay in their own Figma collection (settings [custom color]).
	const customColor = theme.settings?.custom?.color;
	if (customColor && typeof customColor === 'object' && !Array.isArray(customColor)) {
		flattenCustomColorToEntries(customColor, ['custom', 'color'], entries, warnings);
	}

	// --- settings [custom] ---
	// Everything in settings.custom except the color subtree (handled above).
	const custom = theme.settings?.custom;
	if (custom && typeof custom === 'object' && !Array.isArray(custom)) {
		const { color: _color, ...customWithoutColor } = custom;
		flattenToEntries(customWithoutColor, [], 'settings [custom]', entries, warnings);
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

// --- Diff types ---

/** Per-mode comparison between what's in Figma now and what the import would set. */
export type ModeDiff = {
	incoming: string;         // display string for the incoming value
	incomingIsAlias?: boolean; // true when incoming is a resolved Figma variable name
	current?: string;          // display string for the current Figma value (absent if new)
	currentIsAlias?: boolean;  // true when current is a resolved Figma variable name
	changed: boolean;          // true when incoming !== current
};

export type DiffStatus = 'new' | 'changed' | 'unchanged' | 'type-mismatch';

export type DiffEntry = {
	collection: string;
	variableName: string;
	resolvedType: 'COLOR' | 'FLOAT' | 'STRING';
	status: DiffStatus;
	modes: Record<string, ModeDiff>;
};

export type DiffResult = {
	diffs: DiffEntry[];
	warnings: string[];
};

// --- CSS var → display name inference ---

/**
 * Infer a human-readable Figma variable path from a CSS var string.
 *
 * Used as a fallback in the diff preview when the target variable doesn't exist
 * in Figma yet (e.g. first-time import). This reverses the logic of
 * transformTokenReference so the preview shows a meaningful name instead of the
 * raw CSS var string.
 *
 * Examples:
 *   var(--wp--preset--color--primary-lighter)       → palette/primary-lighter
 *   var(--wp--preset--font-family--montserrat)       → typography/fontFamilies/montserrat
 *   var(--wp--preset--font-size--x-large)            → font-size/x-large
 *   var(--wp--preset--spacing--lg)                   → spacing/lg
 *   var(--wp--custom--body--typography--font-family) → body/typography/fontFamily
 *   var(--theme--type--weight--bold)                 → type/weight/bold
 *   var(--token--color--orange-50v)                  → color/orange-50v
 */
export function cssVarToDisplayName(cssVar: string): string {
	const m = cssVar.match(/^var\((--[^)]+)\)$/);
	if (!m) return cssVar;
	const token = m[1];

	// --wp--preset--color--{slug}
	const colorM = token.match(/^--wp--preset--color--(.+)$/);
	if (colorM) return `color/palette/${colorM[1]}`;

	// --wp--preset--font-family--{slug}
	const ffM = token.match(/^--wp--preset--font-family--(.+)$/);
	if (ffM) return `typography/fontFamilies/${ffM[1]}`;

	// --wp--preset--font-size--{slug}
	const fsM = token.match(/^--wp--preset--font-size--(.+)$/);
	if (fsM) return `typography/fontSizes/${fsM[1]}`;

	// --wp--preset--spacing--{slug}
	const spM = token.match(/^--wp--preset--spacing--(.+)$/);
	if (spM) return `spacing/${spM[1]}`;

	// --wp--preset--border-radius--{slug}
	const brM = token.match(/^--wp--preset--border-radius--(.+)$/);
	if (brM) return `border/radiusSizes/${brM[1]}`;

	// --wp--custom--{path}: split on '--', convert each kebab segment to camelCase, join with '/'
	// e.g. body--typography--font-family → body/typography/fontFamily
	const customM = token.match(/^--wp--custom--(.+)$/);
	if (customM) {
		const parts = customM[1].split('--');
		return parts.map(p => p.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())).join('/');
	}

	// --theme--{path}: replace '--' with '/'
	const themeM = token.match(/^--theme--(.+)$/);
	if (themeM) return themeM[1].replace(/--/g, '/');

	// --token--{category}--{rest}: replace '--' with '/'
	const tokenM = token.match(/^--token--(.+)$/);
	if (tokenM) return tokenM[1].replace(/--/g, '/');

	// Generic fallback: strip leading '--' and replace '--' separators with '/'
	return token.replace(/^--/, '').replace(/--/g, '/');
}

// --- Diff helpers ---

/** Convert a FigmaColor to its CSS string representation. */
function figmaColorToCssString(c: FigmaColor): string {
	if (c.a === 0) return 'transparent';
	const h = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
	return c.a >= 1 ? `#${h(c.r)}${h(c.g)}${h(c.b)}` : `#${h(c.r)}${h(c.g)}${h(c.b)}${h(c.a)}`;
}

/** Convert an incoming ImportModeValue to a display string. */
function importValueToDisplay(value: ImportModeValue, resolvedType: string, modeName: string): string {
	if (isVarAliasRef(value)) return value.cssVar;
	// Convert FigmaColor to CSS string regardless of resolvedType — handles the case
	// where a COLOR entry targets a STRING variable and effectiveResolvedType is downgraded.
	if (value !== null && typeof value === 'object' && 'r' in value) {
		return figmaColorToCssString(value as FigmaColor);
	}
	if (resolvedType === 'FLOAT' && typeof value === 'number') {
		return modeName.toLowerCase() === 'vw' ? `${value}vw` : `${value}px`;
	}
	return String(value);
}

/** Convert a raw Figma variable value (from valuesByMode) to a display string. */
async function currentValueToDisplay(
	rawValue: any,
	resolvedType: string,
	modeName: string,
	collectionsMap: Map<string, string>,
): Promise<string> {
	if (rawValue !== null && typeof rawValue === 'object' && rawValue.type === 'VARIABLE_ALIAS') {
		const cssVar = await resolveAliasToString(rawValue.id, collectionsMap);
		return cssVar ?? `alias:${rawValue.id}`;
	}
	if (resolvedType === 'COLOR' && rawValue !== null && typeof rawValue === 'object' && 'r' in rawValue) {
		if (rawValue.a === 0) return 'transparent';
		const h = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
		return rawValue.a >= 1
			? `#${h(rawValue.r)}${h(rawValue.g)}${h(rawValue.b)}`
			: `#${h(rawValue.r)}${h(rawValue.g)}${h(rawValue.b)}${h(rawValue.a)}`;
	}
	if (resolvedType === 'FLOAT' && typeof rawValue === 'number') {
		return modeName.toLowerCase() === 'vw' ? `${rawValue}vw` : `${rawValue}px`;
	}
	return String(rawValue ?? '');
}

/**
 * Read-only pass: compare each ImportEntry against the current Figma state.
 * Returns DiffEntry[] describing what would change if the import were run.
 */
export async function diffImportEntries(entries: ImportEntry[]): Promise<DiffResult> {
	const warnings: string[] = [];
	const diffs: DiffEntry[] = [];

	const existingCollections = await figma.variables.getLocalVariableCollectionsAsync();
	const varLookupCache = new Map<string, Map<string, string>>();

	// Build lookup maps
	const collectionByName = new Map<string, any>();
	const collectionsMap = new Map<string, string>(); // ID → name, for alias resolution
	for (const col of existingCollections) {
		collectionByName.set(col.name.toLowerCase().trim(), col);
		collectionsMap.set(col.id, col.name);
	}

	// Fetch all variables per collection up front
	const varsByCollection = new Map<string, Map<string, any>>();
	for (const col of existingCollections) {
		const vars = await Promise.all(
			col.variableIds.map((id: string) => figma.variables.getVariableByIdAsync(id))
		);
		const varMap = new Map<string, any>();
		for (const v of vars) {
			if (v) varMap.set(v.name, v);
		}
		varsByCollection.set(col.name.toLowerCase().trim(), varMap);
	}

	for (const entry of entries) {
		const existingCollection = collectionByName.get(entry.collection.toLowerCase().trim());
		const existingVar = existingCollection
			? varsByCollection.get(entry.collection.toLowerCase().trim())?.get(entry.variableName)
			: undefined;

		// Mode ID map for this collection
		const modeMap = new Map<string, string>();
		if (existingCollection) {
			for (const m of existingCollection.modes) {
				modeMap.set(m.name.toLowerCase(), m.modeId);
			}
		}

		// Resolve the effective type: if all modes are VarAliasRef, the target variable's
		// type is authoritative (e.g. var(--wp--preset--color--primary) → COLOR, not STRING).
		let effectiveResolvedType: 'COLOR' | 'FLOAT' | 'STRING' = entry.resolvedType;
		for (const value of Object.values(entry.modes)) {
			if (isVarAliasRef(value)) {
				const targetId = await resolveVarRef(value.cssVar, existingCollections, varLookupCache);
				if (targetId) {
					const targetVar = await figma.variables.getVariableByIdAsync(targetId);
					if (targetVar) effectiveResolvedType = targetVar.resolvedType as 'COLOR' | 'FLOAT' | 'STRING';
				}
				break; // all modes share the same type; one lookup is enough
			}
		}

		// Build per-mode display strings. For alias values, resolve to the target Figma
		// variable name so the preview shows "→ palette/primary" instead of the raw
		// CSS var string. Both incoming and current use the same format for comparison.
		const resolveIncoming = async (value: ImportModeValue, modeName: string): Promise<{ text: string; isAlias: boolean }> => {
			if (isVarAliasRef(value)) {
				const targetId = await resolveVarRef(value.cssVar, existingCollections, varLookupCache);
				if (targetId) {
					const v = await figma.variables.getVariableByIdAsync(targetId);
					if (v) return { text: v.name, isAlias: true };
				}
				// Fallback: infer variable name from the CSS var string so the preview
				// shows a useful path (e.g. "palette/primary") even before the target
				// variable has been created in Figma.
				return { text: cssVarToDisplayName(value.cssVar), isAlias: true };
			}
			return { text: importValueToDisplay(value, effectiveResolvedType, modeName), isAlias: false };
		};

		const resolveCurrent = async (rawValue: any, modeName: string): Promise<{ text: string; isAlias: boolean }> => {
			if (rawValue !== null && typeof rawValue === 'object' && rawValue.type === 'VARIABLE_ALIAS') {
				const v = await figma.variables.getVariableByIdAsync(rawValue.id);
				return { text: v?.name ?? `alias:${rawValue.id}`, isAlias: true };
			}
			return { text: await currentValueToDisplay(rawValue, effectiveResolvedType, modeName, collectionsMap), isAlias: false };
		};

		if (!existingVar) {
			const modes: Record<string, ModeDiff> = {};
			for (const [modeName, value] of Object.entries(entry.modes)) {
				const { text, isAlias } = await resolveIncoming(value, modeName);
				modes[modeName] = { incoming: text, incomingIsAlias: isAlias || undefined, changed: true };
			}
			diffs.push({ collection: entry.collection, variableName: entry.variableName, resolvedType: effectiveResolvedType, status: 'new', modes });
			continue;
		}

		// COLOR→STRING downgrade: if the import resolved a color value (e.g. 'transparent' →
		// FigmaColor {r:0,g:0,b:0,a:0}) but the existing Figma variable is STRING type,
		// downgrade so the preview shows the CSS string and doesn't flag a type-mismatch.
		if (effectiveResolvedType === 'COLOR' && existingVar.resolvedType === 'STRING') {
			effectiveResolvedType = 'STRING';
		}

		if (existingVar.resolvedType !== effectiveResolvedType) {
			const modes: Record<string, ModeDiff> = {};
			for (const [modeName, value] of Object.entries(entry.modes)) {
				const { text, isAlias } = await resolveIncoming(value, modeName);
				modes[modeName] = { incoming: text, incomingIsAlias: isAlias || undefined, changed: false };
			}
			diffs.push({ collection: entry.collection, variableName: entry.variableName, resolvedType: effectiveResolvedType, status: 'type-mismatch', modes });
			continue;
		}

		// Compare mode by mode
		const modes: Record<string, ModeDiff> = {};
		let anyChanged = false;

		for (const [modeName, value] of Object.entries(entry.modes)) {
			const { text: incomingText, isAlias: incomingIsAlias } = await resolveIncoming(value, modeName);
			const modeId = modeMap.get(modeName.toLowerCase());

			if (!modeId) {
				modes[modeName] = { incoming: incomingText, incomingIsAlias: incomingIsAlias || undefined, changed: true };
				anyChanged = true;
				continue;
			}

			const rawCurrent = existingVar.valuesByMode?.[modeId];
			let currentText: string | undefined;
			let currentIsAlias = false;
			if (rawCurrent !== undefined) {
				const resolved = await resolveCurrent(rawCurrent, modeName);
				currentText = resolved.text;
				currentIsAlias = resolved.isAlias;
			}

			const changed = currentText !== incomingText;
			if (changed) anyChanged = true;
			modes[modeName] = {
				incoming: incomingText,
				incomingIsAlias: incomingIsAlias || undefined,
				current: currentText,
				currentIsAlias: currentIsAlias || undefined,
				changed,
			};
		}

		diffs.push({
			collection: entry.collection,
			variableName: entry.variableName,
			resolvedType: effectiveResolvedType,
			status: anyChanged ? 'changed' : 'unchanged',
			modes,
		});
	}

	return { diffs, warnings };
}

// --- Figma writer ---

const DEFAULT_MODE_NAME = 'Default';

/** Default fallback values for newly-created variables that need a value for every mode. */
function defaultValue(resolvedType: ImportEntry['resolvedType']): FigmaColor | number | string {
	if (resolvedType === 'COLOR') return { r: 0, g: 0, b: 0, a: 1 };
	if (resolvedType === 'FLOAT') return 0;
	return '';
}

/**
 * Build a lookup map (cssVar string → variable ID) for all variables in a collection,
 * using transformTokenReference to compute the CSS var each variable maps to.
 */
async function buildCollectionVarLookup(collection: any): Promise<Map<string, string>> {
	const lookup = new Map<string, string>();
	const vars = await Promise.all(
		collection.variableIds.map((id: string) => figma.variables.getVariableByIdAsync(id))
	);
	for (const v of vars) {
		if (!v) continue;
		lookup.set(transformTokenReference(collection.name, v.name), v.id);
	}
	return lookup;
}

/**
 * Find the Figma variable ID that corresponds to the given CSS var string.
 *
 * Search order:
 *   1. Local collections (fast, no extra API calls beyond variable fetch)
 *   2. Team library collections (requires "teamlibrary" permission; library
 *      variables are imported via importVariableByKeyAsync so they can be
 *      referenced as aliases even though they live outside the local file).
 *
 * Results are cached in `cache` to avoid redundant API calls across entries.
 */
async function resolveVarRef(
	cssVar: string,
	localCollections: any[],
	cache: Map<string, Map<string, string>>,
): Promise<string | null> {
	// We do NOT filter by collection name — the variable group prefix (e.g. "!-usa/")
	// may differ from the collection name (e.g. "Color"). transformTokenReference
	// handles variable-name prefixes internally, so we let the cached lookup do the
	// matching across every collection.

	// 1. Local collections
	for (const col of localCollections) {
		if (!cache.has(col.id)) {
			cache.set(col.id, await buildCollectionVarLookup(col));
		}
		const id = cache.get(col.id)!.get(cssVar);
		if (id) return id;
	}

	// 2. Team library collections (permission: "teamlibrary")
	let libCollections: any[];
	try {
		libCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
	} catch {
		// API unavailable (older client) or permission not granted
		return null;
	}

	for (const libCol of libCollections) {
		const cacheKey = `lib:${libCol.key}`;
		if (!cache.has(cacheKey)) {
			const libVars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(libCol.key);
			const lookup = new Map<string, string>();
			for (const v of libVars) {
				lookup.set(transformTokenReference(libCol.name, v.name), v.key);
			}
			cache.set(cacheKey, lookup);
		}
		const varKey = cache.get(cacheKey)!.get(cssVar);
		if (varKey) {
			// Import the library variable into the local file to obtain a stable ID
			const imported = await figma.variables.importVariableByKeyAsync(varKey);
			return imported?.id ?? null;
		}
	}

	return null;
}

/**
 * Infer a Figma variable type from a CSS var string without needing the target
 * variable to exist yet. Used in Pass 1 of writeImportEntries when the alias
 * target hasn't been created yet and we still need to choose a type.
 */
function cssVarToInferredType(cssVar: string): 'COLOR' | 'FLOAT' | 'STRING' {
	const m = cssVar.match(/^var\((--[^)]+)\)$/);
	if (!m) return 'STRING';
	const token = m[1];
	if (/^--wp--preset--color--/.test(token)) return 'COLOR';
	if (/^--wp--preset--font-size--/.test(token)) return 'FLOAT';
	if (/^--wp--preset--spacing--/.test(token)) return 'FLOAT';
	if (/^--wp--preset--border-radius--/.test(token)) return 'FLOAT';
	return 'STRING';
}

export async function writeImportEntries(entries: ImportEntry[]): Promise<WriteResult> {
	// Snapshot of pre-existing collections — used only for preExistingModeIds tracking
	// so we never overwrite values in modes that existed before this import started.
	const existingCollections = await figma.variables.getLocalVariableCollectionsAsync();
	const collectionByName = new Map<string, any>();
	for (const col of existingCollections) {
		collectionByName.set(col.name.toLowerCase().trim(), col);
	}

	let created = 0;
	let updated = 0;
	let skipped = 0;
	const warnings: string[] = [];

	// Shared alias lookup cache. Local collection entries (keyed by collection ID)
	// are cleared between collection iterations so stale data isn't used after new
	// variables are created. Team library entries (keyed "lib:*") are stable and
	// survive across iterations.
	const varLookupCache = new Map<string, Map<string, string>>();

	// Deferred aliases: entries whose alias target couldn't be resolved in Pass 1
	// because the target variable hadn't been created yet. Retried in Pass 2.
	const pendingAliases: Array<{
		variable: any;
		modeId: string;
		cssVar: string;
		entryName: string;
	}> = [];

	// Group entries by collection
	const byCollection = new Map<string, ImportEntry[]>();
	for (const entry of entries) {
		const key = entry.collection;
		if (!byCollection.has(key)) byCollection.set(key, []);
		byCollection.get(key)!.push(entry);
	}

	// ─── Pre-pass: create !-theme-tokens stubs ────────────────────────────────
	// If any entry references a var(--theme--...) that can't be resolved from a
	// connected team library, create a local stub STRING variable in a
	// !-theme-tokens collection so that the alias chain survives import. The user
	// can fill in concrete values later (or connect the library and re-import).
	{
		const themeVarNames = new Map<string, string>(); // cssVar → varName
		for (const entry of entries) {
			for (const value of Object.values(entry.modes)) {
				if (isVarAliasRef(value)) {
					const m = value.cssVar.match(/^var\((--theme--[^)]+)\)$/);
					if (m) {
						const token = m[1]; // e.g. --theme--type--weight--regular
						// Convert to variable path: --theme--type--weight--regular → theme/type/weight/regular
						const varName = token.replace(/^--/, '').replace(/--/g, '/');
						themeVarNames.set(value.cssVar, varName);
					}
				}
			}
		}

		if (themeVarNames.size > 0) {
			const initLocalCollections = await figma.variables.getLocalVariableCollectionsAsync();
			const unresolvable: Array<[string, string]> = [];
			for (const [cssVar, varName] of themeVarNames) {
				const targetId = await resolveVarRef(cssVar, initLocalCollections, varLookupCache);
				if (!targetId) unresolvable.push([cssVar, varName]);
			}

			if (unresolvable.length > 0) {
				const THEME_COLLECTION = '!-theme-tokens';
				let themeCollection = collectionByName.get(THEME_COLLECTION);
				if (!themeCollection) {
					themeCollection = figma.variables.createVariableCollection(THEME_COLLECTION);
					const firstModeId = themeCollection.modes[0]?.modeId;
					if (firstModeId) themeCollection.renameMode(firstModeId, DEFAULT_MODE_NAME);
					collectionByName.set(THEME_COLLECTION, themeCollection);
				}

				const existingThemeVarIds: string[] = themeCollection.variableIds ?? [];
				const existingThemeVarNames = new Set<string>();
				for (const id of existingThemeVarIds) {
					const v = await figma.variables.getVariableByIdAsync(id);
					if (v) existingThemeVarNames.add(v.name);
				}

				const defaultModeId = themeCollection.modes[0]?.modeId;
				for (const [, varName] of unresolvable) {
					if (!existingThemeVarNames.has(varName)) {
						try {
							const stub = figma.variables.createVariable(varName, themeCollection, 'STRING');
							// Use the last path segment as the stub value so Figma doesn't
							// show "String value" placeholder (e.g. "bold", "regular").
							const slug = varName.split('/').pop() ?? '';
							if (defaultModeId && slug) {
								try { stub.setValueForMode(defaultModeId, slug); } catch (_) {}
							}
							created++;
						} catch (err) {
							warnings.push(`Could not create stub "${varName}" in ${THEME_COLLECTION}: ${err instanceof Error ? err.message : String(err)}`);
						}
					}
				}

				// Clear local lookup cache so Pass 1 can resolve the new stubs
				for (const key of varLookupCache.keys()) {
					if (!key.startsWith('lib:')) varLookupCache.delete(key);
				}
			}
		}
	}

	// ─── Pass 1: create / update all variables ────────────────────────────────
	// Alias targets that can be resolved immediately (e.g. a color palette variable
	// written in an earlier collection iteration) are set right away. Targets that
	// can't be resolved yet — because they're in the same collection or a later one
	// — are deferred: the variable is created with the correct inferred type and a
	// safe default value, and the alias is queued for Pass 2.

	for (const [collectionName, collectionEntries] of byCollection) {
		// --- Get or create collection ---
		let collection = collectionByName.get(collectionName.toLowerCase().trim());
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

		const refreshModeMap = () =>
			new Map<string, string>(collection.modes.map((m: any) => [m.name.toLowerCase(), m.modeId]));

		let modeMap = refreshModeMap();

		for (const modeName of requiredModeNames) {
			if (!modeMap.has(modeName.toLowerCase())) {
				if (isNewCollection && modeMap.size === 1) {
					const [firstModeId] = modeMap.values();
					collection.renameMode(firstModeId, modeName);
					isNewCollection = false;
				} else {
					collection.addMode(modeName);
				}
				modeMap = refreshModeMap();
			}
		}

		if (modeMap.has('mode 1')) {
			const modeId = modeMap.get('mode 1')!;
			collection.renameMode(modeId, DEFAULT_MODE_NAME);
			modeMap = refreshModeMap();
		}

		// --- Build existing variable map ---
		const fetchedVars = await Promise.all(
			collection.variableIds.map((id: string) => figma.variables.getVariableByIdAsync(id))
		);
		const existingVars = new Map<string, any>();
		for (const v of fetchedVars) {
			if (v) existingVars.set(v.name, v);
		}

		// Track pre-import mode IDs so we never overwrite values in existing modes.
		const preExistingModeIds = new Set(
			existingCollections
				.find((c: any) => c.id === collection.id)
				?.modes.map((m: any) => m.modeId) ?? []
		);

		// Refresh the local-collection alias lookup — previous collection iterations
		// in this run have written new variables that are now queryable.
		const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
		for (const key of varLookupCache.keys()) {
			if (!key.startsWith('lib:')) varLookupCache.delete(key);
		}

		// --- Create or update each variable ---
		for (const entry of collectionEntries) {
			const resolvedModes: Record<string, any> = {};
			// Aliases deferred to Pass 2: only used for --wp--* vars that reference
			// variables being created in this same import batch.
			const deferredModes: Array<{ modeName: string; modeId: string; cssVar: string }> = [];

			// Effective type: determined by the alias target when resolvable, or inferred
			// from the CSS var pattern, or falls back to the parsed entry type.
			let effectiveResolvedType: 'COLOR' | 'FLOAT' | 'STRING' = entry.resolvedType;
			let hasHardAlias = false; // true when an external alias can't be resolved → skip entry

			for (const [modeName, value] of Object.entries(entry.modes)) {
				if (isVarAliasRef(value)) {
					const targetId = await resolveVarRef(value.cssVar, localCollections, varLookupCache);
					if (targetId) {
						// Target exists — resolve type from it and set alias immediately.
						const targetVar = await figma.variables.getVariableByIdAsync(targetId);
						if (targetVar) {
							effectiveResolvedType = targetVar.resolvedType as 'COLOR' | 'FLOAT' | 'STRING';
						}
						resolvedModes[modeName] = { type: 'VARIABLE_ALIAS', id: targetId };
					} else if (/^var\(--wp--/.test(value.cssVar)) {
						// WordPress-namespace variable not found yet — it may be created later
						// in this same import batch. Defer to Pass 2.
						const inferredType = cssVarToInferredType(value.cssVar);
						if (effectiveResolvedType === entry.resolvedType) {
							effectiveResolvedType = inferredType;
						}
						const modeId = modeMap.get(modeName.toLowerCase());
						if (modeId) {
							deferredModes.push({ modeName, modeId, cssVar: value.cssVar });
						} else {
							warnings.push(`Mode "${modeName}" not found in collection "${collectionName}" for variable "${entry.variableName}".`);
						}
					} else if (collectionName.toLowerCase().trim() === 'settings [color]') {
						// Color palette entry: skip — don't create an orphaned color swatch
						// with a wrong default color when the library isn't enabled.
						warnings.push(
							`Skipping "${entry.variableName}" — could not resolve "${value.cssVar}". ` +
							`Enable the library that contains this variable in your Figma file, then re-import.`
						);
						hasHardAlias = true;
						break;
					} else {
						// Non-palette entry (settings [custom], styles, etc.): defer even for
						// external library refs (--theme--, --token--). The variable must exist
						// so that other variables can alias it — an empty default value is better
						// than a missing variable. If Pass 2 also can't resolve it, a warning is
						// emitted and the variable stays with its default value.
						const inferredType = cssVarToInferredType(value.cssVar);
						if (effectiveResolvedType === entry.resolvedType) {
							effectiveResolvedType = inferredType;
						}
						const modeId = modeMap.get(modeName.toLowerCase());
						if (modeId) {
							deferredModes.push({ modeName, modeId, cssVar: value.cssVar });
						} else {
							warnings.push(`Mode "${modeName}" not found in collection "${collectionName}" for variable "${entry.variableName}".`);
						}
					}
				} else {
					resolvedModes[modeName] = value;
				}
			}

			if (hasHardAlias) { skipped++; continue; }

			let variable = existingVars.get(entry.variableName);
			const isNew = !variable;

			// COLOR→STRING downgrade: if the import parsed a color (e.g. 'transparent' →
			// {r:0,g:0,b:0,a:0}) but the existing Figma variable is STRING type, convert
			// the FigmaColor values in resolvedModes to their CSS string representation so
			// we can write the update without hitting a type-mismatch error.
			if (!isNew && effectiveResolvedType === 'COLOR' && variable!.resolvedType === 'STRING') {
				effectiveResolvedType = 'STRING';
				for (const [key, val] of Object.entries(resolvedModes)) {
					if (val !== null && typeof val === 'object' && 'r' in val) {
						resolvedModes[key] = figmaColorToCssString(val as FigmaColor);
					}
				}
			}

			if (isNew) {
				try {
					variable = figma.variables.createVariable(entry.variableName, collection, effectiveResolvedType);
				} catch (err) {
					warnings.push(`Could not create variable "${entry.variableName}": ${err instanceof Error ? err.message : String(err)}`);
					skipped++;
					continue;
				}
			} else if (variable.resolvedType !== effectiveResolvedType) {
				warnings.push(`Skipping "${entry.variableName}" — existing variable type (${variable.resolvedType}) does not match import type (${effectiveResolvedType}).`);
				skipped++;
				continue;
			}

			// Set immediately-resolved values
			let anySet = false;
			for (const [modeName, setVal] of Object.entries(resolvedModes)) {
				const modeId = modeMap.get(modeName.toLowerCase());
				if (!modeId) {
					warnings.push(`Mode "${modeName}" not found in collection "${collectionName}" for variable "${entry.variableName}".`);
					continue;
				}
				try {
					variable.setValueForMode(modeId, setVal);
					anySet = true;
				} catch (err) {
					warnings.push(`Could not set "${entry.variableName}" [${modeName}]: ${err instanceof Error ? err.message : String(err)}`);
				}
			}

			// For deferred modes: write a safe default value now so the variable is
			// fully populated, then queue the alias for Pass 2 to overwrite.
			for (const { modeId, cssVar } of deferredModes) {
				try {
					variable.setValueForMode(modeId, defaultValue(effectiveResolvedType));
					anySet = true;
				} catch (_) {}
				pendingAliases.push({ variable, modeId, cssVar, entryName: entry.variableName });
			}

			// Fill defaults for any modes not covered by this entry (new variables only,
			// or newly-added modes for existing variables — never overwrite existing values).
			const providedModeNames = new Set([
				...Object.keys(resolvedModes).map(m => m.toLowerCase()),
				...deferredModes.map(d => d.modeName.toLowerCase()),
			]);
			if (isNew) {
				for (const [lowerName, modeId] of modeMap) {
					if (!providedModeNames.has(lowerName)) {
						try {
							variable.setValueForMode(modeId, defaultValue(effectiveResolvedType));
						} catch (_) {}
					}
				}
			} else {
				for (const [lowerName, modeId] of modeMap) {
					if (preExistingModeIds.has(modeId)) continue;
					if (!providedModeNames.has(lowerName)) {
						try {
							variable.setValueForMode(modeId, defaultValue(effectiveResolvedType));
						} catch (_) {}
					}
				}
			}

			if (isNew) { created++; } else if (anySet) { updated++; }
		}
	}

	// ─── Pass 2: resolve deferred aliases ─────────────────────────────────────
	// All variables have been created by now. Re-fetch local collections so every
	// variable created in Pass 1 is visible, then set each pending alias value.

	if (pendingAliases.length > 0) {
		const freshLocalCollections = await figma.variables.getLocalVariableCollectionsAsync();
		for (const key of varLookupCache.keys()) {
			if (!key.startsWith('lib:')) varLookupCache.delete(key);
		}

		for (const { variable, modeId, cssVar, entryName } of pendingAliases) {
			const targetId = await resolveVarRef(cssVar, freshLocalCollections, varLookupCache);
			if (!targetId) {
				warnings.push(
					`Could not resolve alias for "${entryName}" — "${cssVar}" was not found. ` +
					`Enable the library that contains this variable in your Figma file, then re-import.`
				);
				continue;
			}
			const targetVar = await figma.variables.getVariableByIdAsync(targetId);
			if (targetVar && targetVar.resolvedType !== variable.resolvedType) {
				warnings.push(
					`Type mismatch for "${entryName}": variable is ${variable.resolvedType} ` +
					`but alias target "${cssVar}" is ${targetVar.resolvedType}.`
				);
				continue;
			}
			try {
				variable.setValueForMode(modeId, { type: 'VARIABLE_ALIAS', id: targetId });
			} catch (err) {
				warnings.push(`Could not set alias for "${entryName}": ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}

	return { created, updated, skipped, warnings };
}
