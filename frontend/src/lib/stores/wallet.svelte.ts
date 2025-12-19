/**
 * Wallet Store - Reactive wrapper for CypherTap balance and payment operations
 * 
 * Provides:
 * - Reactive balance tracking
 * - Ecash token generation for chat payments
 * - Payment status management
 */

import type { PaymentInfo } from '$lib/types/chat';

const MESSAGE_COST_SATS = parseInt(import.meta.env.VITE_MESSAGE_COST_SATS || '1', 10);

interface WalletState {
	balance: number;
	isReady: boolean;
	isLoggedIn: boolean;
	npub: string | null;
	isGeneratingPayment: boolean;
	lastPaymentError: string | null;
}

function createWalletStore() {
	let balance = $state(0);
	let isReady = $state(false);
	let isLoggedIn = $state(false);
	let npub = $state<string | null>(null);
	let isGeneratingPayment = $state(false);
	let lastPaymentError = $state<string | null>(null);

	// Sync with CypherTap - call this in a component with access to cyphertap
	function syncWithCypherTap(cyphertapState: {
		balance: number;
		isReady: boolean;
		isLoggedIn: boolean;
		npub: string | null;
	}): void {
		balance = cyphertapState.balance;
		isReady = cyphertapState.isReady;
		isLoggedIn = cyphertapState.isLoggedIn;
		npub = cyphertapState.npub;
	}

	function hasEnoughBalance(amount: number = MESSAGE_COST_SATS): boolean {
		return isLoggedIn && isReady && balance >= amount;
	}

	async function generatePaymentToken(
		amount: number = MESSAGE_COST_SATS,
		memo: string = 'Chat message'
	): Promise<PaymentInfo | null> {
		if (!hasEnoughBalance(amount)) {
			lastPaymentError = 'Insufficient balance';
			return null;
		}

		isGeneratingPayment = true;
		lastPaymentError = null;

		try {
			// This will be called with the actual cyphertap instance from the component
			// For now, return a placeholder that the component will fill in
			throw new Error('generatePaymentToken must be called with cyphertap instance');
		} catch (e) {
			lastPaymentError = (e as Error).message;
			return null;
		} finally {
			isGeneratingPayment = false;
		}
	}

	// Factory function to create a payment generator bound to cyphertap instance
	function createPaymentGenerator(cyphertap: {
		generateEcashToken: (amount: number, memo: string) => Promise<{ token: string; mint?: string }>;
		balance: number;
		isReady: boolean;
		isLoggedIn: boolean;
	}) {
		return async function generatePayment(
			amount: number = MESSAGE_COST_SATS,
			memo: string = 'Chat message'
		): Promise<PaymentInfo | null> {
			if (!cyphertap.isLoggedIn || !cyphertap.isReady) {
				lastPaymentError = 'Wallet not ready';
				return null;
			}

			if (cyphertap.balance < amount) {
				lastPaymentError = 'Insufficient balance';
				return null;
			}

			isGeneratingPayment = true;
			lastPaymentError = null;

			try {
				const { token, mint } = await cyphertap.generateEcashToken(amount, memo);
				
				return {
					ecash_token: token,
					amount_sats: amount,
					mint,
				};
			} catch (e) {
				lastPaymentError = (e as Error).message;
				return null;
			} finally {
				isGeneratingPayment = false;
			}
		};
	}

	function clearError(): void {
		lastPaymentError = null;
	}

	return {
		get balance() { return balance; },
		get isReady() { return isReady; },
		get isLoggedIn() { return isLoggedIn; },
		get npub() { return npub; },
		get isGeneratingPayment() { return isGeneratingPayment; },
		get lastPaymentError() { return lastPaymentError; },
		get messageCostSats() { return MESSAGE_COST_SATS; },

		syncWithCypherTap,
		hasEnoughBalance,
		createPaymentGenerator,
		clearError,
	};
}

export const walletStore = createWalletStore();

export function useWalletStore() {
	return walletStore;
}
