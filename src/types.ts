export interface ExportOptions {
	baseTheme?: any;
}

export interface VariableCollectionMode {
	modeId: string;
	name: string;
}

export interface VariableCollection {
	name: string;
	modes: VariableCollectionMode[];
	variableIds: string[];
}
