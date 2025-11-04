import { useState, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import * as anchor from '@project-serum/anchor';
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Program ID - matches the smart contract
const PROGRAM_ID = new PublicKey('BqF33RrRRXQ78AtU98kXGyLNuCgd1zmNd4HCJBoJf5G5');

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

  const initializeSlots = async () => {
    if (!program || !wallet.publicKey || !slotsStateAddress) return;

    setIsLoading(true);
    try {
      const tx = await program.methods
        .initialize(wallet.publicKey, wallet.publicKey)
        .accounts({
          slotsState: slotsStateAddress,
          user: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log('Initialize transaction:', tx);
      return tx;
    } catch (error) {
      console.error('Initialize error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const spinSlots = async (betAmount: number) => {
    if (!program || !wallet.publicKey || !slotsStateAddress) return;

    setIsLoading(true);
    try {
      const betAmountLamports = Math.floor(betAmount * LAMPORTS_PER_SOL);

      // Get the current slots state to find treasury
      const slotsState = await program.account.slotsState.fetch(slotsStateAddress);

      const tx = await program.methods
        .spin(new anchor.BN(betAmountLamports))
        .accounts({
          slotsState: slotsStateAddress,
          user: wallet.publicKey,
          treasury: slotsState.treasury,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log('Spin transaction:', tx);

      // Listen for events and return updated state
      const updatedState = await program.account.slotsState.fetch(slotsStateAddress);

      return { tx, state: updatedState };
    } catch (error) {
      console.error('Spin error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
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
    isLoading,
  };
};
