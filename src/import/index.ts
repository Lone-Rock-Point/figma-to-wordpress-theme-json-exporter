import { transformTokenReference } from '../utils/tokens';

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
		return {
			r: parseInt(rgba[1]) / 255,
			g: parseInt(rgba[2]) / 255,
			b: parseInt(rgba[3]) / 255,
			a: rgba[4] !== undefined ? parseFloat(rgba[4]) : 1,
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
	if (value.startsWith('var(')) return { type: 'VAR_ALIAS', cssVar: value };
	return parseColor(value);
}

function isVarAliasRef(v: unknown): v is VarAliasRef {
	return v !== null && typeof v === 'object' && (v as any).type === 'VAR_ALIAS';
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
			// Validate required fields before creating an entry
			if (!item.slug || typeof item.slug !== 'string') {
				warnings.push(`settings [color]: Skipping palette entry — missing or invalid slug.`);
				continue;
			}
			const colorOrAlias = parseColorOrAlias(item.color);
			if (colorOrAlias) {
				entries.push({
					collection: 'settings [color]',
					variableName: `palette/${item.slug}`,
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
	// Helper: narrow to collections whose name matches the expected prefix
	const isRelevant = (name: string) =>
		cssVar.startsWith('var(--token--')
			? name.toLowerCase().trim().startsWith('!-usa')
			: true; // search everything for other prefixes

	// 1. Local collections
	for (const col of localCollections.filter(c => isRelevant(c.name))) {
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

	for (const libCol of libCollections.filter(c => isRelevant(c.name))) {
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

export async function writeImportEntries(entries: ImportEntry[]): Promise<WriteResult> {
	const existingCollections = await figma.variables.getLocalVariableCollectionsAsync();
	const collectionByName = new Map<string, any>();
	for (const col of existingCollections) {
		// Trim + lowercase to match export convention and handle minor whitespace differences
		collectionByName.set(col.name.toLowerCase().trim(), col);
	}

	let created = 0;
	let updated = 0;
	let skipped = 0;
	const warnings: string[] = [];

	// Lazy lookup cache for VarAliasRef resolution: collection ID → (cssVar → variableId)
	// Shared across all collections so the same source collection is only fetched once.
	const varLookupCache = new Map<string, Map<string, string>>();

	// Group entries by collection
	const byCollection = new Map<string, ImportEntry[]>();
	for (const entry of entries) {
		const key = entry.collection;
		if (!byCollection.has(key)) byCollection.set(key, []);
		byCollection.get(key)!.push(entry);
	}

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

		// Build current mode map (lowercase name → modeId)
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

		// --- Build existing variable map in parallel (name → variable) ---
		const fetchedVars = await Promise.all(
			collection.variableIds.map((id: string) => figma.variables.getVariableByIdAsync(id))
		);
		const existingVars = new Map<string, any>();
		for (const v of fetchedVars) {
			if (v) existingVars.set(v.name, v);
		}

		// Track which mode IDs existed before this import (used to decide default-fill scope)
		const preExistingModeIds = new Set(
			existingCollections
				.find((c: any) => c.id === collection.id)
				?.modes.map((m: any) => m.modeId) ?? []
		);

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

			// Set value for each mode explicitly provided by the import
			let anySet = false;
			for (const [modeName, value] of Object.entries(entry.modes)) {
				const modeId = modeMap.get(modeName.toLowerCase());
				if (!modeId) {
					warnings.push(`Mode "${modeName}" not found in collection "${collectionName}" for variable "${entry.variableName}".`);
					continue;
				}

				// Resolve VarAliasRef → Figma VariableAlias before setting
				let setVal: any = value;
				if (isVarAliasRef(value)) {
					const targetId = await resolveVarRef(value.cssVar, existingCollections, varLookupCache);
					if (targetId) {
						setVal = { type: 'VARIABLE_ALIAS', id: targetId };
					} else {
						warnings.push(
							`Could not resolve "${value.cssVar}" to a local Figma variable for "${entry.variableName}" [${modeName}]. ` +
							`Ensure the target collection (e.g. "!-usa") exists in this file.`
						);
						continue;
					}
				}

				try {
					variable.setValueForMode(modeId, setVal);
					anySet = true;
				} catch (err) {
					warnings.push(`Could not set "${entry.variableName}" [${modeName}]: ${err instanceof Error ? err.message : String(err)}`);
				}
			}

			// For NEW variables only: fill newly-added modes with safe defaults so Figma's
			// all-modes requirement is satisfied. Never fill defaults for existing variables
			// to avoid overwriting values the user hasn't asked to change.
			if (isNew) {
				for (const [lowerName, modeId] of modeMap) {
					const providedByImport = Object.keys(entry.modes).some(m => m.toLowerCase() === lowerName);
					if (!providedByImport) {
						try {
							variable.setValueForMode(modeId, defaultValue(entry.resolvedType));
						} catch (_) {
							// best-effort; don't warn for default fills
						}
					}
				}
			} else {
				// For existing variables: only fill defaults for modes that were newly added
				// during this import run (i.e. didn't exist before we started).
				for (const [lowerName, modeId] of modeMap) {
					if (preExistingModeIds.has(modeId)) continue; // mode existed before — don't touch
					const providedByImport = Object.keys(entry.modes).some(m => m.toLowerCase() === lowerName);
					if (!providedByImport) {
						try {
							variable.setValueForMode(modeId, defaultValue(entry.resolvedType));
						} catch (_) {
							// best-effort
						}
					}
				}
			}

			if (isNew) { created++; } else if (anySet) { updated++; }
		}
	}

	return { created, updated, skipped, warnings };
}
