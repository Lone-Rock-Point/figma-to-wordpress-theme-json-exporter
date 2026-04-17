// Interface for export options
export interface ExportOptions {
	baseTheme?: any;
	applyCssVarSyntax?: boolean;
	overwriteExistingVars?: boolean;
	// Legacy options kept for backwards compatibility with existing tests
	generateTypography?: boolean;
	generateColorPresets?: boolean;
	generateSpacingPresets?: boolean;
	selectedColors?: string[];
	useRem?: boolean;
	remCollections?: {
		font?: boolean;
		primitives?: boolean;
		spacing?: boolean;
		[key: string]: boolean | undefined;
	};
}

// TypeScript interface for Figma Variable Collection Mode
export interface VariableCollectionMode {
	modeId: string;
	name: string;
}

// Interface for Figma Variable Collection
export interface VariableCollection {
	name: string;
	modes: VariableCollectionMode[];
	variableIds: string[];
}

// Interface for color preset data used in the UI
export interface ColorPresetData {
	id: string;
	name: string;
	slug: string;
	color: string;
	collectionName: string;
	resolvedColor?: string; // Actual hex/rgb value for preview
} 