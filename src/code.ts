console.clear();

import { ExportOptions } from './types';
import { exportToJSON } from './export/index';

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
	} else if (e.type === "RESIZE") {
		// Handle resize message from the UI
		if (e.width && e.height) {
			figma.ui.resize(
				Math.max(300, Math.round(e.width)),
				Math.max(300, Math.round(e.height))
			);
		}
	}
};

figma.showUI(__uiFiles__["export"], {
	width: 500,
	height: 500,
	themeColors: true,
});
