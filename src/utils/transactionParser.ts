import * as anchor from '@project-serum/anchor';
import { Connection, PublicKey } from '@solana/web3.js';

// TypeScript interfaces for parsed event data
export interface SpinEventData {
  user: PublicKey;
  symbols: [number, number, number];
  payout: number;
  betAmount?: number;
}

export interface SpinRequestedEventData {
  user: PublicKey;
  betAmount: number;
  symbols: [number, number, number];
}

export interface ParsedTransactionResult {
  spinResult?: SpinEventData;
  spinRequested?: SpinRequestedEventData;
  success: boolean;
  error?: string;
}

// Event discriminators for Anchor events
const SPIN_RESULT_DISCRIMINATOR = 'SpinResult';
const SPIN_REQUESTED_DISCRIMINATOR = 'SpinRequested';

/**
 * Extracts SpinResult events from Solana transaction data
 */
export async function extractSpinResultFromTransaction(
  connection: Connection,
  txSignature: string,
  programId: PublicKey
): Promise<ParsedTransactionResult> {
  try {
    // Get transaction details with logs
    const transaction = await connection.getTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });

    if (!transaction) {
      return {
        success: false,
        error: 'Transaction not found'
      };
    }

    // First try to parse events from transaction meta
    const eventResult = parseEventsFromTransaction(transaction, programId);
    if (eventResult.success) {
      return eventResult;
    }

    // If transaction failed, return the error from event parsing
    if (transaction.meta?.err) {
      return eventResult;
    }

    // Fallback to parsing transaction logs
    const logResult = parseTransactionLogs(transaction.meta?.logMessages || [], programId);
    return logResult;

  } catch (error) {
    return {
      success: false,
      error: `Failed to extract spin result: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Parses events from transaction metadata
 */
function parseEventsFromTransaction(
  transaction: any,
  programId: PublicKey
): ParsedTransactionResult {
  try {
    // Check if transaction was successful
    if (transaction.meta?.err) {
      return {
        success: false,
        error: `Transaction failed: ${JSON.stringify(transaction.meta.err)}`
      };
    }

    // Look for program events in inner instructions
    const events = extractEventsFromInnerInstructions(transaction, programId);
    
    if (events.spinResult || events.spinRequested) {
      return {
        success: true,
        ...events
      };
    }

    return {
      success: false,
      error: 'No spin events found in transaction'
    };

  } catch (error) {
    return {
      success: false,
      error: `Failed to parse events: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Extracts events from inner instructions
 */
function extractEventsFromInnerInstructions(
  transaction: any,
  programId: PublicKey
): { spinResult?: SpinEventData; spinRequested?: SpinRequestedEventData } {
  const result: { spinResult?: SpinEventData; spinRequested?: SpinRequestedEventData } = {};

  // Check inner instructions for events
  if (transaction.meta?.innerInstructions) {
    for (const innerInstruction of transaction.meta.innerInstructions) {
      for (const instruction of innerInstruction.instructions) {
        if (instruction.programId === programId.toString()) {
          // Try to decode as event data
          const eventData = tryDecodeEventData(instruction.data);
          if (eventData) {
            if (eventData.type === 'SpinResult') {
              result.spinResult = eventData.data as SpinEventData;
            } else if (eventData.type === 'SpinRequested') {
              result.spinRequested = eventData.data as SpinRequestedEventData;
            }
          }
        }
      }
    }
  }

  return result;
}

/**
 * Attempts to decode event data from instruction data
 */
function tryDecodeEventData(data: string): { type: string; data: any } | null {
  try {
    // Convert base58 data to buffer
    const buffer = Buffer.from(data, 'base58');
    
    // Try to decode as Anchor event
    // This is a simplified approach - in practice, you'd use the actual event layout
    if (buffer.length >= 8) {
      const discriminator = buffer.slice(0, 8);
      const eventData = buffer.slice(8);
      
      // Check discriminator to identify event type
      // Note: In a real implementation, you'd use proper Anchor event decoding
      return tryDecodeByDiscriminator(discriminator, eventData);
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Decodes event data based on discriminator
 */
function tryDecodeByDiscriminator(discriminator: Buffer, data: Buffer): { type: string; data: any } | null {
  // This is a simplified implementation
  // In practice, you'd use proper Anchor event layout decoding
  try {
    // For now, return null as we'll rely on log parsing
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Parses transaction logs as fallback when events are not available
 */
export function parseTransactionLogs(
  logs: string[],
  programId: PublicKey
): ParsedTransactionResult {
  try {
    const result: { spinResult?: SpinEventData; spinRequested?: SpinRequestedEventData } = {};
    
    for (const log of logs) {
      // Look for program log entries
      if (log.includes('Program log:')) {
        const logData = log.replace('Program log: ', '');
        
        // Try to parse SpinResult event from logs
        const spinResult = parseSpinResultFromLog(logData);
        if (spinResult) {
          result.spinResult = spinResult;
        }
        
        // Try to parse SpinRequested event from logs
        const spinRequested = parseSpinRequestedFromLog(logData);
        if (spinRequested) {
          result.spinRequested = spinRequested;
        }
      }
    }

    if (result.spinResult || result.spinRequested) {
      return {
        success: true,
        ...result
      };
    }

    // If no events found in logs, check if transaction was successful
    // and generate fallback data
    const hasSuccessLog = logs.some(log => 
      log.includes('Program') && 
      log.includes('success') && 
      log.includes(programId.toString())
    );

    if (hasSuccessLog) {
      return {
        success: true,
        error: 'Transaction successful but no event data found in logs'
      };
    }

    return {
      success: false,
      error: 'No spin events found in transaction logs'
    };

  } catch (error) {
    return {
      success: false,
      error: `Failed to parse transaction logs: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Attempts to parse SpinResult from log string
 */
function parseSpinResultFromLog(logData: string): SpinEventData | null {
  try {
    // Look for SpinResult event pattern in logs
    // Format: "SpinResult { user: <pubkey>, symbols: [u8, u8, u8], payout: u64 }"
    const spinResultMatch = logData.match(/SpinResult\s*\{([^}]+)\}/);
    if (!spinResultMatch) return null;

    const eventContent = spinResultMatch[1];
    
    // Extract user
    const userMatch = eventContent.match(/user:\s*([A-Za-z0-9]+)/);
    if (!userMatch) return null;
    
    // Extract symbols
    const symbolsMatch = eventContent.match(/symbols:\s*\[(\d+),\s*(\d+),\s*(\d+)\]/);
    if (!symbolsMatch) return null;
    
    // Extract payout
    const payoutMatch = eventContent.match(/payout:\s*(\d+)/);
    if (!payoutMatch) return null;

    return {
      user: new PublicKey(userMatch[1]),
      symbols: [
        parseInt(symbolsMatch[1]),
        parseInt(symbolsMatch[2]),
        parseInt(symbolsMatch[3])
      ] as [number, number, number],
      payout: parseInt(payoutMatch[1])
    };

  } catch (error) {
    return null;
  }
}

/**
 * Attempts to parse SpinRequested from log string
 */
function parseSpinRequestedFromLog(logData: string): SpinRequestedEventData | null {
  try {
    // Look for SpinRequested event pattern in logs
    const spinRequestedMatch = logData.match(/SpinRequested\s*\{([^}]+)\}/);
    if (!spinRequestedMatch) return null;

    const eventContent = spinRequestedMatch[1];
    
    // Extract user
    const userMatch = eventContent.match(/user:\s*([A-Za-z0-9]+)/);
    if (!userMatch) return null;
    
    // Extract bet_amount
    const betAmountMatch = eventContent.match(/bet_amount:\s*(\d+)/);
    if (!betAmountMatch) return null;
    
    // Extract symbols
    const symbolsMatch = eventContent.match(/symbols:\s*\[(\d+),\s*(\d+),\s*(\d+)\]/);
    if (!symbolsMatch) return null;

    return {
      user: new PublicKey(userMatch[1]),
      betAmount: parseInt(betAmountMatch[1]),
      symbols: [
        parseInt(symbolsMatch[1]),
        parseInt(symbolsMatch[2]),
        parseInt(symbolsMatch[3])
      ] as [number, number, number]
    };

  } catch (error) {
    return null;
  }
}

/**
 * Validates parsed event data
 */
export function validateSpinEventData(data: SpinEventData): boolean {
  try {
    // Validate user is a valid PublicKey
    if (!data.user || !(data.user instanceof PublicKey)) {
      return false;
    }

    // Validate symbols array
    if (!Array.isArray(data.symbols) || data.symbols.length !== 3) {
      return false;
    }

    // Validate each symbol is a valid number (0-7 based on smart contract)
    for (const symbol of data.symbols) {
      if (typeof symbol !== 'number' || symbol < 0 || symbol > 7) {
        return false;
      }
    }

    // Validate payout is a non-negative number
    if (typeof data.payout !== 'number' || data.payout < 0) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Converts lamports to SOL for display purposes
 */
export function lamportsToSol(lamports: number): number {
  return lamports / 1000000000; // 1 SOL = 1,000,000,000 lamports
}

/**
 * Converts SOL to lamports for transaction purposes
 */
export function solToLamports(sol: number): number {
  return Math.floor(sol * 1000000000);
}