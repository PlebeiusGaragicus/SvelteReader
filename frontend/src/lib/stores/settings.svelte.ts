/**
 * Settings Store - Reactive store for app settings with localStorage persistence
 * 
 * Provides:
 * - Auto-publish annotations toggle (default: true)
 * - Persisted to localStorage
 */

import { browser } from '$app/environment';

const STORAGE_KEY = 'sveltereader-settings';

interface Settings {
	autoPublishAnnotations: boolean;
}

const DEFAULT_SETTINGS: Settings = {
	autoPublishAnnotations: true,
};

function loadSettings(): Settings {
	if (!browser) return DEFAULT_SETTINGS;
	
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
		}
	} catch (e) {
		console.error('Failed to load settings:', e);
	}
	return DEFAULT_SETTINGS;
}

function saveSettings(settings: Settings): void {
	if (!browser) return;
	
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch (e) {
		console.error('Failed to save settings:', e);
	}
}

function createSettingsStore() {
	let autoPublishAnnotations = $state(DEFAULT_SETTINGS.autoPublishAnnotations);
	let initialized = false;

	function initialize(): void {
		if (initialized || !browser) return;
		
		const loaded = loadSettings();
		autoPublishAnnotations = loaded.autoPublishAnnotations;
		initialized = true;
	}

	function setAutoPublishAnnotations(value: boolean): void {
		autoPublishAnnotations = value;
		saveSettings({ autoPublishAnnotations });
	}

	function reset(): void {
		autoPublishAnnotations = DEFAULT_SETTINGS.autoPublishAnnotations;
		saveSettings(DEFAULT_SETTINGS);
	}

	// Auto-initialize on first access in browser
	if (browser) {
		initialize();
	}

	return {
		get autoPublishAnnotations() { return autoPublishAnnotations; },
		
		setAutoPublishAnnotations,
		initialize,
		reset,
	};
}

export const settingsStore = createSettingsStore();

export function useSettingsStore() {
	return settingsStore;
}
