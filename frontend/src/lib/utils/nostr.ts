/**
 * Nostr utility functions
 * Simple bech32 decoder for npub without heavy dependencies
 */

const BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32ToBytes(bech32: string): { hrp: string; data: Uint8Array } | null {
	const lower = bech32.toLowerCase();
	const pos = lower.lastIndexOf('1');
	
	if (pos < 1 || pos + 7 > lower.length) {
		return null;
	}
	
	const hrp = lower.slice(0, pos);
	const dataChars = lower.slice(pos + 1);
	
	// Decode data characters to 5-bit values
	const data5bit: number[] = [];
	for (const char of dataChars) {
		const idx = BECH32_ALPHABET.indexOf(char);
		if (idx === -1) return null;
		data5bit.push(idx);
	}
	
	// Remove checksum (last 6 characters)
	const payload5bit = data5bit.slice(0, -6);
	
	// Convert 5-bit to 8-bit
	let acc = 0;
	let bits = 0;
	const result: number[] = [];
	
	for (const value of payload5bit) {
		acc = (acc << 5) | value;
		bits += 5;
		while (bits >= 8) {
			bits -= 8;
			result.push((acc >> bits) & 0xff);
		}
	}
	
	return { hrp, data: new Uint8Array(result) };
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Decode an npub (bech32-encoded public key) to hex
 * @param npub - The npub string (e.g., "npub1...")
 * @returns The hex-encoded public key, or null if invalid
 */
export function decodeNpub(npub: string): string | null {
	if (!npub.startsWith('npub1')) {
		return null;
	}
	
	try {
		const decoded = bech32ToBytes(npub);
		if (!decoded || decoded.hrp !== 'npub') {
			return null;
		}
		
		// Public key should be 32 bytes
		if (decoded.data.length !== 32) {
			return null;
		}
		
		return bytesToHex(decoded.data);
	} catch {
		return null;
	}
}

/**
 * Encode a hex public key to npub format
 * @param hex - The hex-encoded public key
 * @returns The npub string, or null if invalid
 */
export function encodeNpub(hex: string): string | null {
	if (hex.length !== 64) {
		return null;
	}
	
	try {
		// Convert hex to bytes
		const bytes = new Uint8Array(32);
		for (let i = 0; i < 32; i++) {
			bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
		}
		
		// Convert 8-bit to 5-bit
		const data5bit: number[] = [];
		let acc = 0;
		let bits = 0;
		
		for (const byte of bytes) {
			acc = (acc << 8) | byte;
			bits += 8;
			while (bits >= 5) {
				bits -= 5;
				data5bit.push((acc >> bits) & 0x1f);
			}
		}
		if (bits > 0) {
			data5bit.push((acc << (5 - bits)) & 0x1f);
		}
		
		// Calculate checksum (simplified - using polymod)
		const hrp = 'npub';
		const checksum = bech32Checksum(hrp, data5bit);
		
		// Encode to bech32
		const allData = [...data5bit, ...checksum];
		const encoded = hrp + '1' + allData.map(d => BECH32_ALPHABET[d]).join('');
		
		return encoded;
	} catch {
		return null;
	}
}

function bech32Polymod(values: number[]): number {
	const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
	let chk = 1;
	for (const v of values) {
		const top = chk >> 25;
		chk = ((chk & 0x1ffffff) << 5) ^ v;
		for (let i = 0; i < 5; i++) {
			if ((top >> i) & 1) {
				chk ^= GEN[i];
			}
		}
	}
	return chk;
}

function hrpExpand(hrp: string): number[] {
	const result: number[] = [];
	for (const c of hrp) {
		result.push(c.charCodeAt(0) >> 5);
	}
	result.push(0);
	for (const c of hrp) {
		result.push(c.charCodeAt(0) & 31);
	}
	return result;
}

function bech32Checksum(hrp: string, data: number[]): number[] {
	const values = [...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
	const polymod = bech32Polymod(values) ^ 1;
	const checksum: number[] = [];
	for (let i = 0; i < 6; i++) {
		checksum.push((polymod >> (5 * (5 - i))) & 31);
	}
	return checksum;
}
