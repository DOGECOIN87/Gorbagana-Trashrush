// Re-export all transaction parser utilities
export * from './transactionParser';

// Re-export fallback generator utilities
export * from './fallbackGenerator';

// Re-export error handling utilities
export * from './errorHandler';

// Additional utility types that might be useful
export interface SpinResult {
  symbols: [number, number, number];
  payout: number;
  txSignature: string;
  timestamp?: number;
  betAmount?: number;
}

export interface TransactionError {
  code: string;
  message: string;
  logs?: string[];
}