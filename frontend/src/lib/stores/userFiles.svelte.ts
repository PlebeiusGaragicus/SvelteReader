/**
 * User Files Store - Reactive store for user-uploaded files
 * 
 * Manages PDFs, images, and text files uploaded by the user.
 * Files are stored in IndexedDB and scoped to the user's npub.
 */

import { browser } from '$app/environment';

// =============================================================================
// TYPES
// =============================================================================

export type FileType = 'pdf' | 'image' | 'text';

export interface UserFile {
	id: string;
	npub: string;                  // Owner's npub for scoping
	name: string;
	type: FileType;
	mimeType: string;
	size: number;                  // File size in bytes
	content: ArrayBuffer;          // Raw file content
	textContent?: string;          // Extracted text for RAG (PDFs, text files)
	textPreview?: string;          // First ~200 characters of text for preview
	thumbnail?: string;            // Base64 data URL for preview (images, PDF first page)
	description?: string;          // User-provided description
	sourceUrl?: string;            // URL where the file was obtained
	tags?: string[];               // User-defined tags
	isPublic?: boolean;            // Whether to sync to Nostr (false = local only)
	createdAt: number;
	updatedAt: number;
}

export interface FileUploadResult {
	success: boolean;
	file?: UserFile;
	error?: string;
}

// =============================================================================
// INDEXEDDB HELPERS
// =============================================================================

const DB_NAME = 'sveltereader-files';
const DB_VERSION = 1;
const STORE_NAME = 'files';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
	if (!browser) return Promise.reject(new Error('Not in browser'));
	
	if (!dbPromise) {
		dbPromise = new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);
			
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result);
			
			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
					store.createIndex('npub', 'npub', { unique: false });
					store.createIndex('type', 'type', { unique: false });
					store.createIndex('createdAt', 'createdAt', { unique: false });
				}
			};
		});
	}
	
	return dbPromise;
}

async function saveFile(file: UserFile): Promise<void> {
	const db = await getDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const request = store.put(file);
		
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve();
	});
}

async function loadFiles(npub: string): Promise<UserFile[]> {
	const db = await getDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const store = tx.objectStore(STORE_NAME);
		const index = store.index('npub');
		const request = index.getAll(npub);
		
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result || []);
	});
}

async function deleteFileFromDB(id: string): Promise<void> {
	const db = await getDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const request = store.delete(id);
		
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve();
	});
}

async function clearFilesForNpub(npub: string): Promise<void> {
	const files = await loadFiles(npub);
	const db = await getDB();
	
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		
		let completed = 0;
		const total = files.length;
		
		if (total === 0) {
			resolve();
			return;
		}
		
		for (const file of files) {
			const request = store.delete(file.id);
			request.onsuccess = () => {
				completed++;
				if (completed === total) resolve();
			};
			request.onerror = () => reject(request.error);
		}
	});
}

// =============================================================================
// FILE PROCESSING HELPERS
// =============================================================================

// Magic byte signatures for file type detection
const FILE_SIGNATURES: { bytes: number[]; offset?: number; type: FileType; mimeType: string }[] = [
	// PDF
	{ bytes: [0x25, 0x50, 0x44, 0x46], type: 'pdf', mimeType: 'application/pdf' }, // %PDF
	
	// Images
	{ bytes: [0xFF, 0xD8, 0xFF], type: 'image', mimeType: 'image/jpeg' }, // JPEG
	{ bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], type: 'image', mimeType: 'image/png' }, // PNG
	{ bytes: [0x47, 0x49, 0x46, 0x38], type: 'image', mimeType: 'image/gif' }, // GIF87a/GIF89a
	{ bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, type: 'image', mimeType: 'image/webp' }, // RIFF (WebP container - needs WEBP check)
	{ bytes: [0x42, 0x4D], type: 'image', mimeType: 'image/bmp' }, // BMP
	{ bytes: [0x00, 0x00, 0x01, 0x00], type: 'image', mimeType: 'image/x-icon' }, // ICO
	{ bytes: [0x00, 0x00, 0x02, 0x00], type: 'image', mimeType: 'image/x-icon' }, // CUR
];

/**
 * Detect file type from content using magic bytes
 * Falls back to browser-provided MIME type, then to extension analysis
 */
function detectFileTypeFromContent(
	arrayBuffer: ArrayBuffer, 
	browserMimeType: string, 
	fileName: string
): { type: FileType; mimeType: string } {
	const bytes = new Uint8Array(arrayBuffer.slice(0, 16));
	
	// Check magic bytes
	for (const sig of FILE_SIGNATURES) {
		const offset = sig.offset ?? 0;
		let match = true;
		
		for (let i = 0; i < sig.bytes.length; i++) {
			if (bytes[offset + i] !== sig.bytes[i]) {
				match = false;
				break;
			}
		}
		
		if (match) {
			// Special check for WebP (RIFF container)
			if (sig.mimeType === 'image/webp') {
				// Check for WEBP signature at offset 8
				if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
					return { type: 'image', mimeType: 'image/webp' };
				}
				continue; // Not a WebP, might be another RIFF format
			}
			return { type: sig.type, mimeType: sig.mimeType };
		}
	}
	
	// Check for SVG (text-based, starts with < and contains <svg)
	const textStart = new TextDecoder().decode(bytes);
	if (textStart.trim().startsWith('<') || textStart.includes('<?xml')) {
		// Read more to check for SVG
		const moreBytes = new Uint8Array(arrayBuffer.slice(0, 1024));
		const moreText = new TextDecoder().decode(moreBytes).toLowerCase();
		if (moreText.includes('<svg')) {
			return { type: 'image', mimeType: 'image/svg+xml' };
		}
	}
	
	// Fall back to browser-provided MIME type (if it seems valid)
	if (browserMimeType && browserMimeType !== 'application/octet-stream') {
		if (browserMimeType === 'application/pdf') return { type: 'pdf', mimeType: browserMimeType };
		if (browserMimeType.startsWith('image/')) return { type: 'image', mimeType: browserMimeType };
		if (browserMimeType.startsWith('text/')) return { type: 'text', mimeType: browserMimeType };
	}
	
	// Try to detect text files by checking if content is valid UTF-8 text
	try {
		const textContent = new TextDecoder('utf-8', { fatal: true }).decode(
			new Uint8Array(arrayBuffer.slice(0, 1024))
		);
		// If we can decode it as UTF-8 and it looks like text, treat as text
		if (textContent && !textContent.includes('\x00')) {
			// Determine text subtype from extension
			const ext = fileName.split('.').pop()?.toLowerCase();
			if (ext === 'md' || ext === 'markdown') {
				return { type: 'text', mimeType: 'text/markdown' };
			}
			return { type: 'text', mimeType: 'text/plain' };
		}
	} catch {
		// Not valid UTF-8 text
	}
	
	// Last resort: use browser MIME or default to text
	return { 
		type: getFileTypeFromMime(browserMimeType), 
		mimeType: browserMimeType || 'application/octet-stream' 
	};
}

function getFileTypeFromMime(mimeType: string): FileType {
	if (mimeType === 'application/pdf') return 'pdf';
	if (mimeType.startsWith('image/')) return 'image';
	return 'text';
}


async function createThumbnail(file: File, type: FileType, arrayBuffer?: ArrayBuffer): Promise<string | undefined> {
	if (type === 'image') {
		return new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				const img = new Image();
				img.onload = () => {
					const canvas = document.createElement('canvas');
					const maxSize = 200;
					let width = img.width;
					let height = img.height;
					
					if (width > height) {
						if (width > maxSize) {
							height = (height * maxSize) / width;
							width = maxSize;
						}
					} else {
						if (height > maxSize) {
							width = (width * maxSize) / height;
							height = maxSize;
						}
					}
					
					canvas.width = width;
					canvas.height = height;
					const ctx = canvas.getContext('2d');
					ctx?.drawImage(img, 0, 0, width, height);
					resolve(canvas.toDataURL('image/jpeg', 0.7));
				};
				img.onerror = () => resolve(undefined);
				img.src = e.target?.result as string;
			};
			reader.onerror = () => resolve(undefined);
			reader.readAsDataURL(file);
		});
	}
	
	// PDF thumbnail generation using pdfjs-dist
	if (type === 'pdf' && arrayBuffer) {
		try {
			// Dynamic import to avoid SSR issues
			const pdfjs = await import('pdfjs-dist');
			
			// Set up worker
			if (!pdfjs.GlobalWorkerOptions.workerSrc) {
				pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
			}
			
			// Load PDF
			const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
			const pdf = await loadingTask.promise;
			const page = await pdf.getPage(1);
			
			// Render at scale for good quality
			const scale = 1.0;
			const viewport = page.getViewport({ scale });
			
			const canvas = document.createElement('canvas');
			const context = canvas.getContext('2d');
			if (!context) return undefined;
			
			canvas.width = viewport.width;
			canvas.height = viewport.height;
			
			await page.render({
				canvasContext: context,
				viewport: viewport
			}).promise;
			
			// Crop to 2:3 aspect ratio (like book covers)
			const targetAspect = 2 / 3;
			const currentAspect = canvas.width / canvas.height;
			
			let cropWidth = canvas.width;
			let cropHeight = canvas.height;
			let cropX = 0;
			let cropY = 0;
			
			if (currentAspect > targetAspect) {
				cropWidth = canvas.height * targetAspect;
				cropX = (canvas.width - cropWidth) / 2;
			} else {
				cropHeight = canvas.width / targetAspect;
			}
			
			// Create cropped thumbnail
			const thumbCanvas = document.createElement('canvas');
			thumbCanvas.width = 150;
			thumbCanvas.height = 225;
			const thumbCtx = thumbCanvas.getContext('2d');
			if (!thumbCtx) return undefined;
			
			thumbCtx.drawImage(
				canvas,
				cropX, cropY, cropWidth, cropHeight,
				0, 0, 150, 225
			);
			
			return thumbCanvas.toDataURL('image/jpeg', 0.85);
		} catch (e) {
			console.warn('[UserFiles] PDF thumbnail generation failed:', e);
			return undefined;
		}
	}
	
	return undefined;
}

async function extractTextContent(file: File, type: FileType, arrayBuffer?: ArrayBuffer): Promise<{ text?: string; preview?: string }> {
	if (type === 'text') {
		const text = await file.text();
		const preview = text.slice(0, 200).replace(/\s+/g, ' ').trim();
		return { text, preview: preview + (text.length > 200 ? '...' : '') };
	}
	
	// PDF text extraction using pdfjs-dist
	if (type === 'pdf' && arrayBuffer) {
		try {
			const pdfjs = await import('pdfjs-dist');
			
			if (!pdfjs.GlobalWorkerOptions.workerSrc) {
				pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
			}
			
			const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
			const pdf = await loadingTask.promise;
			
			let fullText = '';
			const maxPages = Math.min(pdf.numPages, 5);
			
			for (let i = 1; i <= maxPages; i++) {
				const page = await pdf.getPage(i);
				const textContent = await page.getTextContent();
				const pageText = textContent.items
					.filter((item): item is { str: string } => 'str' in item)
					.map(item => item.str)
					.join(' ');
				fullText += pageText + '\n';
			}
			
			const preview = fullText.slice(0, 200).replace(/\s+/g, ' ').trim();
			return { 
				text: fullText, 
				preview: preview ? preview + (fullText.length > 200 ? '...' : '') : 'PDF Document'
			};
		} catch (e) {
			console.warn('[UserFiles] PDF text extraction failed:', e);
			return { preview: 'PDF Document' };
		}
	}
	
	return {};
}

// =============================================================================
// STORE
// =============================================================================

function createUserFilesStore() {
	// State
	let files = $state<UserFile[]>([]);
	let npub = $state<string | null>(null);
	let initialized = $state(false);
	let loading = $state(false);

	// Derived
	const pdfFiles = $derived(files.filter(f => f.type === 'pdf'));
	const imageFiles = $derived(files.filter(f => f.type === 'image'));
	const textFiles = $derived(files.filter(f => f.type === 'text'));
	
	const totalSize = $derived(
		files.reduce((sum, f) => sum + f.size, 0)
	);

	// Initialize for a user
	async function initialize(userNpub: string): Promise<void> {
		if (!browser) return;
		if (initialized && npub === userNpub) return;
		
		loading = true;
		
		try {
			npub = userNpub;
			files = await loadFiles(userNpub);
			// Sort by creation date (newest first)
			files.sort((a, b) => b.createdAt - a.createdAt);
			initialized = true;
			console.log(`[UserFiles] Loaded ${files.length} files for ${userNpub.slice(0, 8)}...`);
		} catch (e) {
			console.error('[UserFiles] Failed to initialize:', e);
		} finally {
			loading = false;
		}
	}

	// Change user (reinitialize)
	async function setNpub(userNpub: string | null): Promise<void> {
		if (npub === userNpub) return;
		
		if (!userNpub) {
			npub = null;
			files = [];
			initialized = false;
			return;
		}
		
		await initialize(userNpub);
	}

	// Upload a file
	async function uploadFile(file: File): Promise<FileUploadResult> {
		if (!npub) {
			return { success: false, error: 'No user logged in' };
		}
		
		// Max file size: 50MB
		const maxSize = 50 * 1024 * 1024;
		if (file.size > maxSize) {
			return { success: false, error: 'File too large (max 50MB)' };
		}
		
		try {
			// Read file content first
			const content = await file.arrayBuffer();
			
			// Detect file type from content (magic bytes), not just extension/browser MIME
			const detected = detectFileTypeFromContent(content, file.type, file.name);
			const type = detected.type;
			const mimeType = detected.mimeType;
			
			// Validate detected file type is one we support
			const supportedTypes: FileType[] = ['pdf', 'image', 'text'];
			if (!supportedTypes.includes(type)) {
				return { success: false, error: `Unsupported file type: ${mimeType}` };
			}
			
			console.log(`[UserFiles] Detected type: ${type} (${mimeType}) for ${file.name}`);
			
			const thumbnail = await createThumbnail(file, type, content);
			const { text: textContent, preview: textPreview } = await extractTextContent(file, type, content);
			
			const now = Date.now();
			const userFile: UserFile = {
				id: crypto.randomUUID(),
				npub,
				name: file.name,
				type,
				mimeType,
				size: file.size,
				content,
				textContent,
				textPreview,
				thumbnail,
				createdAt: now,
				updatedAt: now,
			};
			
			await saveFile(userFile);
			files = [userFile, ...files];
			
			console.log(`[UserFiles] Uploaded: ${file.name} as ${type}`);
			return { success: true, file: userFile };
		} catch (e) {
			console.error('[UserFiles] Upload failed:', e);
			return { success: false, error: (e as Error).message };
		}
	}

	// Delete a file
	async function deleteFile(id: string): Promise<void> {
		await deleteFileFromDB(id);
		files = files.filter(f => f.id !== id);
	}

	// Rename a file
	async function renameFile(id: string, newName: string): Promise<void> {
		const file = files.find(f => f.id === id);
		if (!file) return;
		
		const updatedFile: UserFile = {
			...file,
			name: newName,
			updatedAt: Date.now(),
		};
		
		await saveFile(updatedFile);
		files = files.map(f => f.id === id ? updatedFile : f);
	}

	// Update file metadata
	// Editable fields that users can modify
	type EditableFields = 'name' | 'description' | 'sourceUrl' | 'tags' | 'thumbnail' | 'isPublic';
	
	async function updateFile(id: string, updates: Partial<Pick<UserFile, EditableFields>>): Promise<void> {
		const file = files.find(f => f.id === id);
		if (!file) return;
		
		const updatedFile: UserFile = {
			...file,
			...updates,
			updatedAt: Date.now(),
		};
		
		await saveFile(updatedFile);
		files = files.map(f => f.id === id ? updatedFile : f);
	}

	// Get file by ID
	function getFile(id: string): UserFile | undefined {
		return files.find(f => f.id === id);
	}

	// Get file content as Blob
	function getFileBlob(file: UserFile): Blob {
		return new Blob([file.content], { type: file.mimeType });
	}

	// Get file content as Object URL
	function getFileUrl(file: UserFile): string {
		const blob = getFileBlob(file);
		return URL.createObjectURL(blob);
	}

	// Clear all files for current user
	async function clearAll(): Promise<void> {
		if (!npub) return;
		
		await clearFilesForNpub(npub);
		files = [];
	}

	// Format file size for display
	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	return {
		// State getters
		get files() { return files; },
		get pdfFiles() { return pdfFiles; },
		get imageFiles() { return imageFiles; },
		get textFiles() { return textFiles; },
		get npub() { return npub; },
		get initialized() { return initialized; },
		get loading() { return loading; },
		get totalSize() { return totalSize; },
		
		// Methods
		initialize,
		setNpub,
		uploadFile,
		deleteFile,
		renameFile,
		updateFile,
		getFile,
		getFileBlob,
		getFileUrl,
		clearAll,
		formatSize,
	};
}

export const userFilesStore = createUserFilesStore();

