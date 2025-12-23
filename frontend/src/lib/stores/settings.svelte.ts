/**
 * Settings Store - Reactive store for app settings with localStorage persistence
 * 
 * Note: Annotation publishing is controlled per-book via book.isPublic.
 * This store is reserved for future reader settings (font size, theme, etc.)
 */

import { browser } from '$app/environment';

const STORAGE_KEY = 'sveltereader-settings';

interface Settings {
	// Reserved for future settings (font size, theme, etc.)
}

const DEFAULT_SETTINGS: Settings = {};

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
	let initialized = false;

	function initialize(): void {
		if (initialized || !browser) return;
		loadSettings();
		initialized = true;
	}

	function reset(): void {
		saveSettings(DEFAULT_SETTINGS);
	}

	// Auto-initialize on first access in browser
	if (browser) {
		initialize();
	}

	return {
		initialize,
		reset,
	};
}

export const settingsStore = createSettingsStore();

export function useSettingsStore() {
	return settingsStore;
}
