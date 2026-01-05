/**
 * Mode Store - Reactive store for app mode with localStorage persistence
 * 
 * Tracks which "mode" the app is in. Each mode is like a mini-app with its own
 * functionality while sharing common infrastructure (auth, wallet, etc.)
 */

import { browser } from '$app/environment';

const STORAGE_KEY = 'sveltereader-mode';

export type AppMode = 'reader' | 'webscrape' | 'synthesize';

export interface ModeInfo {
	id: AppMode;
	name: string;
	description: string;
	icon: string; // Lucide icon name
	route: string;
}

export const MODES: ModeInfo[] = [
	{
		id: 'reader',
		name: 'Reader',
		description: 'Read and annotate ebooks',
		icon: 'BookOpen',
		route: '/reader'
	},
	{
		id: 'webscrape',
		name: 'Web Scrape',
		description: 'Search and synthesize from the web',
		icon: 'Globe',
		route: '/webscrape'
	},
	{
		id: 'synthesize',
		name: 'Synthesize',
		description: 'Deep research and knowledge synthesis',
		icon: 'FlaskConical',
		route: '/synthesize'
	}
];

function loadMode(): AppMode {
	if (!browser) return 'reader';
	
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored && (stored === 'reader' || stored === 'webscrape' || stored === 'synthesize')) {
			return stored as AppMode;
		}
	} catch (e) {
		console.error('Failed to load mode:', e);
	}
	return 'reader';
}

function saveMode(mode: AppMode): void {
	if (!browser) return;
	
	try {
		localStorage.setItem(STORAGE_KEY, mode);
	} catch (e) {
		console.error('Failed to save mode:', e);
	}
}

function createModeStore() {
	let currentMode = $state<AppMode>(loadMode());

	function setMode(mode: AppMode): void {
		currentMode = mode;
		saveMode(mode);
	}

	function getModeInfo(mode: AppMode): ModeInfo {
		return MODES.find(m => m.id === mode) || MODES[0];
	}

	return {
		get current() { return currentMode; },
		get currentInfo() { return getModeInfo(currentMode); },
		get modes() { return MODES; },
		setMode,
		getModeInfo
	};
}

export const modeStore = createModeStore();

