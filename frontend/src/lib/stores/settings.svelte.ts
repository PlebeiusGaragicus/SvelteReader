/**
 * Settings Store - Reactive store for app settings with localStorage persistence
 * 
 * Note: Annotation publishing is controlled per-book via book.isPublic.
 * This store handles reader settings (font size, font family, etc.)
 */

import { browser } from '$app/environment';

const STORAGE_KEY = 'sveltereader-settings';

export type FontFamily = 'original' | 'georgia' | 'palatino' | 'times' | 'arial' | 'helvetica' | 'verdana';

export interface ReaderSettings {
	fontSize: number; // Percentage (100 = 100%)
	fontFamily: FontFamily;
}

interface Settings {
	reader: ReaderSettings;
}

const DEFAULT_SETTINGS: Settings = {
	reader: {
		fontSize: 100,
		fontFamily: 'original'
	}
};

function loadSettings(): Settings {
	if (!browser) return DEFAULT_SETTINGS;
	
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			return { 
				...DEFAULT_SETTINGS, 
				...parsed,
				reader: { ...DEFAULT_SETTINGS.reader, ...parsed.reader }
			};
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
	let settings = $state<Settings>(DEFAULT_SETTINGS);

	function initialize(): void {
		if (initialized || !browser) return;
		settings = loadSettings();
		initialized = true;
	}

	function setFontSize(size: number): void {
		const clampedSize = Math.max(50, Math.min(200, size));
		settings.reader.fontSize = clampedSize;
		saveSettings(settings);
	}

	function setFontFamily(family: FontFamily): void {
		settings.reader.fontFamily = family;
		saveSettings(settings);
	}

	function increaseFontSize(): void {
		setFontSize(settings.reader.fontSize + 10);
	}

	function decreaseFontSize(): void {
		setFontSize(settings.reader.fontSize - 10);
	}

	function reset(): void {
		settings = { ...DEFAULT_SETTINGS };
		saveSettings(settings);
	}

	// Auto-initialize on first access in browser
	if (browser) {
		initialize();
	}

	return {
		get reader() { return settings.reader; },
		get fontSize() { return settings.reader.fontSize; },
		get fontFamily() { return settings.reader.fontFamily; },
		initialize,
		setFontSize,
		setFontFamily,
		increaseFontSize,
		decreaseFontSize,
		reset,
	};
}

export const settingsStore = createSettingsStore();

export function useSettingsStore() {
	return settingsStore;
}
