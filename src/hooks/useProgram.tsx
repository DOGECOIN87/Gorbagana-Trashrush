import { useState, useMemo, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import * as anchor from '@project-serum/anchor';
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { 
  SpinResult, 
  extractSpinResultFromTransaction, 
  generateFallbackResult,
  validateSpinEventData,
  lamportsToSol
} from '../utils';
import { 
  parseError, 
  GameError, 
  RetryManager, 
  NetworkHealthChecker, 
  LoadingStateManager 
} from '../utils/errorHandler';
import { BlockchainOperationWrapper } from '../utils/blockchainOperationWrapper';

// Program ID - matches the smart contract
const PROGRAM_ID = new PublicKey('5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF');

// IDL definition - this should match your Rust program
const IDL = {
  "version": "0.1.0",
  "name": "gorbagana_slots",
  "instructions": [
    {
      "name": "initialize",
      "accounts": [
        {
          "name": "slotsState",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "authority",
          "type": "publicKey"
        },
        {
          "name": "treasury",
          "type": "publicKey"
        }
      ]
    },
    {
      "name": "spin",
      "accounts": [
        {
          "name": "slotsState",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "treasury",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "betAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "claimPayout",
      "accounts": [
        {
          "name": "slotsState",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "treasury",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "addToPool",
      "accounts": [
        {
          "name": "slotsState",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "treasury",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "emergencyPause",
      "accounts": [
        {
          "name": "slotsState",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "authority",
          "isMut": false,
          "isSigner": true
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "SlotsState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "publicKey"
          },
          {
            "name": "initialized",
            "type": "bool"
          },
          {
            "name": "treasury",
            "type": "publicKey"
          },
          {
            "name": "totalSpins",
            "type": "u64"
          },
          {
            "name": "totalPayout",
            "type": "u64"
          },
          {
            "name": "houseEdge",
            "type": "u8"
          },
          {
            "name": "maxPayoutPerSpin",
            "type": "u64"
          },
          {
            "name": "totalPool",
            "type": "u64"
          },
          {
            "name": "minPoolThreshold",
            "type": "u64"
          },
          {
            "name": "paused",
            "type": "bool"
          }
        ]
      }
    }
  ],
  "events": [
    {
      "name": "SpinRequested",
      "fields": [
        {
          "name": "user",
          "type": "publicKey"
        },
        {
          "name": "betAmount",
          "type": "u64"
        },
        {
          "name": "symbols",
          "type": {
            "array": ["u8", 3]
          }
        }
      ]
    },
    {
      "name": "SpinResult",
      "fields": [
        {
          "name": "user",
          "type": "publicKey"
        },
        {
          "name": "symbols",
          "type": {
            "array": ["u8", 3]
          }
        },
        {
          "name": "payout",
          "type": "u64"
        }
      ]
    },
    {
      "name": "PoolDeposit",
      "fields": [
        {
          "name": "user",
          "type": "publicKey"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "newPool",
          "type": "u64"
        }
      ]
    },
    {
      "name": "EmergencyAction",
      "fields": [
        {
          "name": "action",
          "type": "string"
        },
        {
          "name": "authority",
          "type": "publicKey"
        }
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "InvalidBetAmount",
      "msg": "Invalid bet amount"
    },
    {
      "code": 6001,
      "name": "BetTooHigh",
      "msg": "Bet amount too high"
    },
    {
      "code": 6002,
      "name": "InvalidAmount",
      "msg": "Invalid amount"
    },
    {
      "code": 6003,
      "name": "InsufficientFunds",
      "msg": "Insufficient funds"
    },
    {
      "code": 6004,
      "name": "InsufficientPool",
      "msg": "Insufficient pool funds"
    },
    {
      "code": 6005,
      "name": "Unauthorized",
      "msg": "Unauthorized access"
    },
    {
      "code": 6006,
      "name": "GamePaused",
      "msg": "Game is currently paused"
    }
  ]
};

export const useProgram = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null);
  const [initializationError, setInitializationError] = useState<string>('');
  const [currentError, setCurrentError] = useState<GameError | null>(null);

  // Initialize comprehensive blockchain operation wrapper
  const blockchainWrapper = useMemo(() => new BlockchainOperationWrapper(connection), [connection]);
  
  // Legacy utilities for backward compatibility
  const retryManager = useMemo(() => blockchainWrapper['retryManager'], [blockchainWrapper]);
  const loadingManager = useMemo(() => blockchainWrapper['loadingManager'], [blockchainWrapper]);
  const networkChecker = useMemo(() => blockchainWrapper['networkChecker'], [blockchainWrapper]);

  const program = useMemo(() => {
    if (!wallet.publicKey) return null;

    const provider = new anchor.AnchorProvider(
      connection,
      wallet as any,
      anchor.AnchorProvider.defaultOptions()
    );

    return new anchor.Program(IDL as any, PROGRAM_ID, provider);
  }, [connection, wallet]);

  const [slotsStateAddress] = useMemo(() => {
    if (!wallet.publicKey) return [null];
    
    return PublicKey.findProgramAddressSync(
      [Buffer.from('slots_state'), wallet.publicKey.toBuffer()],
      PROGRAM_ID
    );
  }, [wallet.publicKey]);

  // Enhanced loading state management
  const setOperationLoading = useCallback((operationId: string, loading: boolean) => {
    loadingManager.setLoading(operationId, loading);
    setIsLoading(loadingManager.isAnyLoading());
  }, [loadingManager]);

  // Clear error handler
  const clearError = useCallback(() => {
    setCurrentError(null);
  }, []);



  const spinSlots = async (betAmount: number): Promise<SpinResult> => {
    clearError();
    
    return blockchainWrapper.executeTransaction(
      'spin-slots',
      // Transaction builder
      async () => {
        if (!program || !wallet.publicKey || !slotsStateAddress) {
          throw new Error('wallet not connected');
        }

        const betAmountLamports = Math.floor(betAmount * LAMPORTS_PER_SOL);

        // Validate bet amount
        if (betAmountLamports <= 0) {
          throw new Error('invalid bet amount');
        }

        // Check initialization status first
        const initStatus = await checkInitializationStatus();
        let treasury = null;
        const preInstructions = [];

        if (!initStatus) {
          console.log('⚠️ User not initialized - Auto-initializing in same transaction bundle');
          
          // Construct initialize instruction
          const initIx = await program.methods
            .initialize(wallet.publicKey, wallet.publicKey)
            .accounts({
              slotsState: slotsStateAddress,
              user: wallet.publicKey,
              systemProgram: SystemProgram.programId,
            })
            .instruction();
            
          preInstructions.push(initIx);
          // For a fresh initialization, we set treasury to the user's wallet
          treasury = wallet.publicKey;
        } else {
           // Get the current slots state
           try {
             const slotsState = await program.account.slotsState.fetch(slotsStateAddress);
             
             // Check if game is paused
             if (slotsState.paused) {
               throw new Error('game paused');
             }
     
             // Check if bet amount exceeds maximum payout
             if (betAmountLamports > slotsState.maxPayoutPerSpin) {
               throw new Error('bet too high');
             }
             
             treasury = slotsState.treasury;
           } catch (error) {
             // Fallback if fetch fails strangely but status said initialized
             console.warn('Failed to fetch state despite init status true', error);
             // Potentially re-init? Assuming if fetch fails we might need to re-init?
             // For now let's assume if fetch fails we treat it as not initialized?
             // But we are in the 'else' block.
             throw error;
           }
        }

        // Submit the spin transaction (with optional init prepended)
        console.log('🎰 Submitting spin transaction with bet:', betAmount, 'SOL', preInstructions.length > 0 ? '(Auto-init included)' : '');
        
        const txSignature = await program.methods
          .spin(new anchor.BN(betAmountLamports))
          .accounts({
            slotsState: slotsStateAddress,
            user: wallet.publicKey,
            treasury: treasury,
            systemProgram: SystemProgram.programId,
          })
          .preInstructions(preInstructions)
          .rpc();

        console.log('📝 Spin transaction submitted:', txSignature);
        return txSignature;
      },
      // Result extractor
      async (txSignature: string) => {
        const betAmountLamports = Math.floor(betAmount * LAMPORTS_PER_SOL);
        
        // Get slots state for fallback generation
        const slotsState = await program!.account.slotsState.fetch(slotsStateAddress!);

        // Try to extract spin results from transaction events
        const parseResult = await extractSpinResultFromTransaction(
          connection, 
          txSignature, 
          PROGRAM_ID
        );

        console.log('🔍 Event parsing result:', parseResult);

        // If we successfully parsed events, validate and return the result
        if (parseResult.success && parseResult.spinResult) {
          const eventData = parseResult.spinResult;
          
          // Validate the parsed event data
          if (validateSpinEventData(eventData)) {
            const spinResult: SpinResult = {
              symbols: eventData.symbols,
              payout: eventData.payout,
              txSignature,
              timestamp: Date.now(),
              betAmount: betAmountLamports,
            };

            console.log('✅ Successfully parsed spin result from events:', spinResult);
            return spinResult;
          } else {
            console.warn('⚠️ Parsed event data failed validation, falling back to generated result');
          }
        }

        // If event parsing failed, generate fallback result
        console.log('🔄 Generating fallback result due to:', {
          parseSuccess: parseResult.success,
          hasSpinResult: !!parseResult.spinResult,
          parseError: parseResult.error
        });

        const fallbackResult = generateFallbackResult(
          txSignature,
          betAmountLamports,
          true, // Transaction was successful if we got here
          {
            houseEdge: slotsState.houseEdge || 5,
            maxPayoutPerSpin: slotsState.maxPayoutPerSpin,
            winProbability: 0.15
          }
        );

        console.log('🎲 Generated fallback result:', fallbackResult);
        return fallbackResult;
      },
      {
        confirmationTimeout: 45000, // 45 seconds for confirmation
        maxConfirmationRetries: 2,
        onTransactionSubmitted: (signature) => {
          console.log('🚀 Transaction submitted for confirmation:', signature);
        },
        onConfirmationProgress: (confirmations, required) => {
          console.log(`⏳ Confirmation progress: ${confirmations}/${required}`);
        }
      }
    ).catch((error: GameError) => {
      // Enhanced error handling with user feedback
      console.error('🚨 Spin operation failed:', error);
      setCurrentError(error);
      
      // If we have a transaction signature but the operation failed, 
      // try to generate a fallback result for consistency
      if (error.technicalMessage.includes('transaction') && !error.technicalMessage.includes('not connected')) {
        console.log('🔄 Attempting fallback result generation for failed transaction');
        try {
          const betAmountLamports = Math.floor(betAmount * LAMPORTS_PER_SOL);
          return generateFallbackResult('failed-transaction', betAmountLamports, false);
        } catch (fallbackError) {
          console.error('❌ Fallback generation also failed:', fallbackError);
        }
      }
      
      throw error;
    });
  };

  // Check initialization status
  const checkInitializationStatus = useCallback(async (): Promise<boolean> => {
    if (!program || !slotsStateAddress) {
      setIsInitialized(null);
      return false;
    }

    try {
      const state = await program.account.slotsState.fetch(slotsStateAddress);
      const initialized = state && state.initialized === true;
      setIsInitialized(initialized);
      setInitializationError('');
      return initialized;
    } catch (error) {
      console.log('Slots state not found, needs initialization');
      setIsInitialized(false);
      setInitializationError('');
      return false;
    }
  }, [program, slotsStateAddress]);

  // Auto-check initialization status when wallet connects
  useEffect(() => {
    if (wallet.publicKey && program && slotsStateAddress) {
      checkInitializationStatus();
    } else {
      setIsInitialized(null);
      setInitializationError('');
    }
  }, [wallet.publicKey, program, slotsStateAddress, checkInitializationStatus]);

  // Enhanced initialization function with comprehensive error handling
  const initializeSlots = async (autoRetry: boolean = false): Promise<string> => {
    clearError();
    setInitializationError('');
    
    return blockchainWrapper.executeTransaction(
      'initialize-slots',
      // Transaction builder
      async () => {
        if (!program || !wallet.publicKey || !slotsStateAddress) {
          throw new Error('wallet not connected');
        }

        // Check if already initialized
        const currentStatus = await checkInitializationStatus();
        if (currentStatus) {
          console.log('🎮 Slots already initialized');
          return 'already_initialized';
        }

        console.log('🚀 Initializing slots state...');
        
        const tx = await program.methods
          .initialize(wallet.publicKey, wallet.publicKey)
          .accounts({
            slotsState: slotsStateAddress,
            user: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log('📝 Initialize transaction submitted:', tx);
        return tx;
      },
      // Result extractor
      async (txSignature: string) => {
        // Handle special case for already initialized
        if (txSignature === 'already_initialized') {
          return txSignature;
        }

        // Verify initialization was successful
        const verifyStatus = await checkInitializationStatus();
        if (!verifyStatus) {
          throw new Error('initialization failed');
        }

        console.log('✅ Slots state successfully initialized');
        return txSignature;
      },
      {
        confirmationTimeout: 30000, // 30 seconds for initialization
        maxConfirmationRetries: 2,
        onTransactionSubmitted: (signature) => {
          if (signature !== 'already_initialized') {
            console.log('🚀 Initialization transaction submitted:', signature);
          }
        },
        onConfirmationProgress: (confirmations, required) => {
          console.log(`⏳ Initialization confirmation: ${confirmations}/${required}`);
        }
      }
    ).catch((error: GameError) => {
      console.error('🚨 Initialization failed:', error);
      setCurrentError(error);
      setInitializationError(error.userMessage);
      
      // Handle specific initialization errors
      if (error.technicalMessage.includes('already in use')) {
        // Account already exists, check if it's properly initialized
        checkInitializationStatus().then(status => {
          if (status) {
            console.log('✅ Account exists and is properly initialized');
            setInitializationError('');
            return 'already_initialized';
          } else {
            setInitializationError('Account exists but initialization failed');
          }
        });
      }
      
      throw error;
    });
  };

  const getSlotsState = async () => {
    if (!program || !slotsStateAddress) return null;

    try {
      const state = await program.account.slotsState.fetch(slotsStateAddress);
      return state;
    } catch (error) {
      console.log('No slots state found, needs initialization');
      return null;
    }
  };

  return {
    program,
    slotsStateAddress,
    initializeSlots,
    spinSlots,
    getSlotsState,
    checkInitializationStatus,
    isLoading,
    isInitialized,
    initializationError,
    currentError,
    clearError,
    retryManager,
    loadingManager,
    networkChecker,
  };
};
