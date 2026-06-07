console.clear();

import { ExportOptions } from './types';
import { exportToJSON } from './export/index';
import { parseThemeJson, diffImportEntries, writeImportEntries } from './import/index';

figma.ui.onmessage = async (e) => {
	console.log("code received message", e);

	if (e.type === "EXPORT") {
		try {
			const options: ExportOptions = e.options || {};
			await exportToJSON(options);
		} catch (error) {
			figma.ui.postMessage({
				type: "EXPORT_RESULT",
				error: error instanceof Error ? error.message : String(error)
			});
		}

	} else if (e.type === "IMPORT_PREVIEW") {
		try {
			const { entries, warnings: parseWarnings } = parseThemeJson(e.themeJson);
			const { diffs, warnings: diffWarnings } = await diffImportEntries(entries);
			figma.ui.postMessage({
				type: "IMPORT_PREVIEW_RESULT",
				entries,
				diffs,
				warnings: [...parseWarnings, ...diffWarnings],
			});
		} catch (error) {
			figma.ui.postMessage({
				type: "IMPORT_PREVIEW_RESULT",
				entries: [],
				diffs: [],
				warnings: [error instanceof Error ? error.message : String(error)],
			});
		}

	} else if (e.type === "IMPORT") {
		try {
			const { entries, warnings: parseWarnings } = parseThemeJson(e.themeJson);
			const result = await writeImportEntries(entries);
			figma.ui.postMessage({
				type: "IMPORT_RESULT",
				...result,
				warnings: [...parseWarnings, ...result.warnings],
			});
		} catch (error) {
			figma.ui.postMessage({
				type: "IMPORT_RESULT",
				created: 0, updated: 0, skipped: 0,
				warnings: [error instanceof Error ? error.message : String(error)],
			});
		}

	} else if (e.type === "RESIZE") {
		if (e.width && e.height) {
			figma.ui.resize(
				Math.max(300, Math.round(e.width)),
				Math.max(300, Math.round(e.height))
			);
		}
	}
};

if (figma.command === "importJson") {
	figma.showUI(__uiFiles__["importJson"], {
		width: 500,
		height: 500,
		themeColors: true,
	});
} else {
	// default: export
	figma.showUI(__uiFiles__["exportJson"], {
		width: 500,
		height: 500,
		themeColors: true,
	});
}
