// Artifact store using Svelte 5 runes
// Manages versioned markdown artifacts within projects with IndexedDB persistence

import { nanoid } from 'nanoid';
import { untrack } from 'svelte';
import type { Artifact, ArtifactVersion } from './types';
import { synthesizeDb } from '$lib/services/synthesizeDb';

// Reactive state
let artifacts = $state<Artifact[]>([]);
let currentArtifactId = $state<string | null>(null);
let openArtifactIds = $state<string[]>([]);
let liveContentMap = $state<Record<string, string>>({});

// Derived state
const currentArtifact = $derived(artifacts.find((a) => a.id === currentArtifactId) ?? null);

const currentArtifactContent = $derived.by(() => {
	if (!currentArtifact) return null;
	return currentArtifact.versions[currentArtifact.currentVersionIndex] ?? null;
});

const openArtifacts = $derived.by(() => {
	return openArtifactIds.map((id) => artifacts.find((a) => a.id === id)).filter(Boolean) as Artifact[];
});

const hasDirtyArtifacts = $derived(artifacts.some((a) => a.isDirty === true));

const dirtyArtifactIds = $derived(artifacts.filter((a) => a.isDirty === true).map((a) => a.id));

// Persistence helper
async function persistArtifact(artifact: Artifact): Promise<void> {
	try {
		const plainArtifact: Artifact = JSON.parse(
			JSON.stringify({
				id: artifact.id,
				projectId: artifact.projectId,
				currentVersionIndex: artifact.currentVersionIndex,
				versions: artifact.versions,
				createdAt: artifact.createdAt,
				updatedAt: artifact.updatedAt,
				viewed: artifact.viewed ?? false,
				tags: artifact.tags || []
			})
		);

		await synthesizeDb.artifacts.save(plainArtifact);

		if (artifact.isDirty) {
			artifacts = artifacts.map((a) => (a.id === artifact.id ? { ...a, isDirty: false } : a));
		}
	} catch (error) {
		console.error('Failed to persist artifact:', error);
	}
}

// Get artifacts for a specific project
function getProjectArtifacts(projectId: string): Artifact[] {
	return artifacts.filter((a) => a.projectId === projectId).sort((a, b) => b.updatedAt - a.updatedAt);
}

// Load artifacts for a project from IndexedDB
async function loadProjectArtifacts(projectId: string): Promise<void> {
	try {
		const loadedArtifacts = await synthesizeDb.artifacts.getByProject(projectId);
		const otherArtifacts = untrack(() => artifacts.filter((a) => a.projectId !== projectId));
		artifacts = [...otherArtifacts, ...loadedArtifacts];
	} catch (error) {
		console.error('Failed to load artifacts from IndexedDB:', error);
	}
}

// Actions
function createArtifact(projectId: string, title: string, content: string = ''): Artifact {
	const now = Date.now();
	const version: ArtifactVersion = {
		index: 0,
		title,
		content,
		createdAt: now
	};

	const artifact: Artifact = {
		id: nanoid(),
		projectId,
		currentVersionIndex: 0,
		versions: [version],
		createdAt: now,
		updatedAt: now,
		viewed: false
	};

	artifacts = [...artifacts, artifact];
	currentArtifactId = artifact.id;

	if (!openArtifactIds.includes(artifact.id)) {
		openArtifactIds = [...openArtifactIds, artifact.id];
	}

	persistArtifact(artifact);

	return artifact;
}

function updateArtifact(
	id: string,
	title: string,
	content: string,
	createNewVersion: boolean = false
): ArtifactVersion {
	const artifact = artifacts.find((a) => a.id === id);
	if (!artifact) {
		throw new Error(`Artifact ${id} not found`);
	}

	const now = Date.now();
	let updatedArtifact: Artifact;
	let resultVersion: ArtifactVersion;

	if (createNewVersion) {
		const newVersion: ArtifactVersion = {
			index: artifact.versions.length,
			title,
			content,
			createdAt: now
		};

		updatedArtifact = {
			...artifact,
			versions: [...artifact.versions, newVersion],
			currentVersionIndex: newVersion.index,
			updatedAt: now
		};
		resultVersion = newVersion;
	} else {
		const versions = [...artifact.versions];
		const currentVersion = versions[artifact.currentVersionIndex];

		if (currentVersion) {
			versions[artifact.currentVersionIndex] = {
				...currentVersion,
				title,
				content
			};
		}

		updatedArtifact = {
			...artifact,
			versions,
			updatedAt: now
		};
		resultVersion = versions[artifact.currentVersionIndex];
	}

	artifacts = artifacts.map((a) => (a.id === id ? updatedArtifact : a));
	liveContentMap[id] = content;

	persistArtifact(updatedArtifact);

	return resultVersion;
}

function setArtifactVersion(id: string, versionIndex: number): void {
	const artifact = artifacts.find((a) => a.id === id);
	if (!artifact || versionIndex < 0 || versionIndex >= artifact.versions.length) return;

	artifacts = artifacts.map((a) => (a.id === id ? { ...a, currentVersionIndex: versionIndex } : a));
}

function toggleArtifactTag(id: string, tagName: string): void {
	const artifact = artifacts.find((a) => a.id === id);
	if (!artifact) return;

	const currentTags = artifact.tags || [];
	const hasTag = currentTags.includes(tagName);

	const newTags = hasTag ? currentTags.filter((t) => t !== tagName) : [...currentTags, tagName];

	artifacts = artifacts.map((a) => (a.id === id ? { ...a, tags: newTags } : a));

	persistArtifact(artifacts.find((a) => a.id === id)!);
}

function removeTagFromAllArtifacts(projectId: string, tagName: string): void {
	const projectArtifacts = artifacts.filter((a) => a.projectId === projectId);

	projectArtifacts.forEach((artifact) => {
		if (artifact.tags?.includes(tagName)) {
			const newTags = artifact.tags.filter((t) => t !== tagName);
			artifacts = artifacts.map((a) => (a.id === artifact.id ? { ...a, tags: newTags } : a));
			persistArtifact(artifacts.find((a) => a.id === artifact.id)!);
		}
	});
}

function renameArtifact(id: string, newTitle: string): void {
	const artifact = artifacts.find((a) => a.id === id);
	if (!artifact) return;

	const updatedArtifact = {
		...artifact,
		versions: artifact.versions.map((v, i) =>
			i === artifact.currentVersionIndex ? { ...v, title: newTitle } : v
		),
		updatedAt: Date.now()
	};

	artifacts = artifacts.map((a) => (a.id === id ? updatedArtifact : a));
	persistArtifact(updatedArtifact);
}

async function deleteArtifact(id: string): Promise<void> {
	artifacts = artifacts.filter((a) => a.id !== id);
	openArtifactIds = openArtifactIds.filter((openId) => openId !== id);

	if (currentArtifactId === id) {
		currentArtifactId = openArtifactIds[0] ?? null;
	}

	try {
		await synthesizeDb.artifacts.delete(id);
	} catch (error) {
		console.error('Failed to delete artifact from IndexedDB:', error);
	}
}

function selectArtifact(id: string | null): void {
	currentArtifactId = id;

	if (id) {
		const artifact = artifacts.find((a) => a.id === id);
		if (artifact && !artifact.viewed) {
			artifacts = artifacts.map((a) => (a.id === id ? { ...a, viewed: true } : a));
			persistArtifact(artifacts.find((a) => a.id === id)!);
		}

		if (!openArtifactIds.includes(id)) {
			openArtifactIds = [...openArtifactIds, id];
		}
	}
}

function closeArtifact(id: string): void {
	openArtifactIds = openArtifactIds.filter((openId) => openId !== id);
	delete liveContentMap[id];

	if (currentArtifactId === id) {
		currentArtifactId = openArtifactIds[openArtifactIds.length - 1] ?? null;
	}
}

function updateLiveContent(id: string, content: string): void {
	liveContentMap[id] = content;

	const artifact = artifacts.find((a) => a.id === id);
	if (artifact && !artifact.isDirty) {
		artifacts = artifacts.map((a) => (a.id === id ? { ...a, isDirty: true } : a));
	}
}

function getLiveContent(id: string): string | null {
	if (liveContentMap[id] !== undefined) {
		return liveContentMap[id];
	}
	const artifact = artifacts.find((a) => a.id === id);
	if (!artifact) return null;
	return artifact.versions[artifact.currentVersionIndex]?.content || '';
}

function loadArtifacts(loadedArtifacts: Artifact[]): void {
	artifacts = loadedArtifacts;
}

async function saveAllDirtyArtifacts(): Promise<void> {
	const dirtyIds = untrack(() => artifacts.filter((a) => a.isDirty === true).map((a) => a.id));

	if (dirtyIds.length === 0) {
		return;
	}

	console.log(`[ArtifactStore] Saving ${dirtyIds.length} dirty artifacts...`);

	const savePromises = dirtyIds.map(async (id) => {
		const artifact = untrack(() => artifacts.find((a) => a.id === id));
		if (!artifact) return;

		const liveContent = untrack(() => liveContentMap[id]);

		if (liveContent === undefined) {
			artifacts = artifacts.map((a) => (a.id === id ? { ...a, isDirty: false } : a));
			return;
		}

		const currentVersion = artifact.versions[artifact.currentVersionIndex];
		if (!currentVersion) return;

		const storedContent = currentVersion.content || '';
		if (liveContent.trim() === storedContent.trim()) {
			artifacts = artifacts.map((a) => (a.id === id ? { ...a, isDirty: false } : a));
			return;
		}

		const updatedVersions = [...artifact.versions];
		updatedVersions[artifact.currentVersionIndex] = {
			...currentVersion,
			content: liveContent
		};

		const updatedArtifact: Artifact = {
			...artifact,
			versions: updatedVersions,
			updatedAt: Date.now(),
			isDirty: false
		};

		artifacts = artifacts.map((a) => (a.id === id ? updatedArtifact : a));
		await persistArtifact(updatedArtifact);
	});

	await Promise.all(savePromises);
	console.log(`[ArtifactStore] Saved ${dirtyIds.length} dirty artifacts`);
}

async function saveArtifactNow(id: string): Promise<void> {
	const artifact = untrack(() => artifacts.find((a) => a.id === id));
	if (!artifact) return;

	const liveContent = untrack(() => liveContentMap[id]);
	if (liveContent === undefined) return;

	const currentVersion = artifact.versions[artifact.currentVersionIndex];
	if (!currentVersion) return;

	if (liveContent.trim() === (currentVersion.content || '').trim()) {
		if (artifact.isDirty) {
			artifacts = artifacts.map((a) => (a.id === id ? { ...a, isDirty: false } : a));
		}
		return;
	}

	const updatedVersions = [...artifact.versions];
	updatedVersions[artifact.currentVersionIndex] = {
		...currentVersion,
		content: liveContent
	};

	const updatedArtifact: Artifact = {
		...artifact,
		versions: updatedVersions,
		updatedAt: Date.now(),
		isDirty: false
	};

	artifacts = artifacts.map((a) => (a.id === id ? updatedArtifact : a));
	await persistArtifact(updatedArtifact);
}

function reset(): void {
	artifacts = [];
	currentArtifactId = null;
	openArtifactIds = [];
	liveContentMap = {};
}

function clearProjectState(): void {
	currentArtifactId = null;
	openArtifactIds = [];
	liveContentMap = {};
}

// Export reactive getters and actions
export const synthArtifactStore = {
	get artifacts() {
		return artifacts;
	},
	get currentArtifact() {
		return currentArtifact;
	},
	get currentArtifactId() {
		return currentArtifactId;
	},
	get currentArtifactContent() {
		return currentArtifactContent;
	},
	get openArtifacts() {
		return openArtifacts;
	},
	get openArtifactIds() {
		return openArtifactIds;
	},
	get hasDirtyArtifacts() {
		return hasDirtyArtifacts;
	},
	get dirtyArtifactIds() {
		return dirtyArtifactIds;
	},

	getProjectArtifacts,
	loadProjectArtifacts,
	createArtifact,
	updateArtifact,
	setArtifactVersion,
	toggleArtifactTag,
	removeTagFromAllArtifacts,
	renameArtifact,
	deleteArtifact,
	selectArtifact,
	closeArtifact,
	updateLiveContent,
	getLiveContent,
	loadArtifacts,

	saveAllDirtyArtifacts,
	saveArtifactNow,
	reset,
	clearProjectState
};

