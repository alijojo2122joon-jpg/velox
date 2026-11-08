import crypto from 'node:crypto';
import { randomToken } from '../../lib/util.ts';

/**
 * Payment provider abstraction.
 * Real Indonesian gateways (Midtrans, Xendit, DOKU) all follow the same pattern:
 *   1. server creates a charge → gets a reference + checkout URL / QRIS string / VA number
 *   2. customer pays in their app
 *   3. gateway calls our webhook (signed) → we verify the signature → only then mark the payment succeeded
 * VELOX never marks a payment successful from client-side input. The mock provider follows the same contract.
 */
export type PaymentMethod = 'qris' | 'bank_transfer' | 'ewallet' | 'card';

export interface CreateChargeResult {
  providerRef: string;
  checkoutUrl: string;
  isTest: boolean;
}

export interface ProviderEvent {
  providerRef: string;
  status: 'succeeded' | 'failed' | 'expired';
  raw: unknown;
}

export interface PaymentProvider {
  name: string;
  createCharge(input: { amount: number; method: PaymentMethod; description: string; bookingCode: string }): CreateChargeResult;
  /** Verify a webhook request and convert it to a normalized event. Throws if the signature is invalid. */
  parseWebhook(headers: Record<string, string | string[] | undefined>, body: any): ProviderEvent;
  refund(providerRef: string, amount: number): { ok: boolean };
}

// ── Mock provider (DEMO ONLY — no money moves) ──
const MOCK_SECRET = process.env.MOCK_PAYMENT_SECRET ?? randomToken(24);

export const signMock = (body: string) => crypto.createHmac('sha256', MOCK_SECRET).update(body).digest('hex');

export const mockProvider: PaymentProvider = {
  name: 'mock',
  createCharge({ bookingCode }) {
    const providerRef = `MOCK-${bookingCode}-${randomToken(6)}`;
    return { providerRef, checkoutUrl: `/pay/${providerRef}`, isTest: true };
  },
  parseWebhook(headers, body) {
    const sig = headers['x-mock-signature'];
    const expected = signMock(JSON.stringify(body));
    if (typeof sig !== 'string' || sig.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error('INVALID_SIGNATURE');
    return { providerRef: body.ref, status: body.status, raw: body };
  },
  refund() { return { ok: true }; },
};

// A Midtrans/Xendit implementation goes here once business verification & API keys are in place.
// Keys MUST be read from server environment variables (MIDTRANS_SERVER_KEY, XENDIT_SECRET_KEY) — never shipped to the frontend.

export function getProvider(name: string): PaymentProvider {
  if (name === 'mock') return mockProvider;
  throw new Error(`Payment provider "${name}" is not configured`);
}
