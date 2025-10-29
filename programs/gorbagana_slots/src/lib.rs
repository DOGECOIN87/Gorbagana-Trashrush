use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

declare_id!("5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF");

#[program]
pub mod gorbagana_slots {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, authority: Pubkey, treasury: Pubkey) -> Result<()> {
        let slots_state = &mut ctx.accounts.slots_state;
        slots_state.authority = authority;
        slots_state.initialized = true;
        slots_state.treasury = treasury;
        slots_state.total_spins = 0;
        slots_state.total_payout = 0;
        slots_state.house_edge = 5; // 5% house edge
        slots_state.max_payout_per_spin = 1000000000; // 1 SOL max initially
        slots_state.total_pool = 0;
        slots_state.min_pool_threshold = 100000000; // 0.1 SOL minimum pool
        Ok(())
    }

    pub fn spin(ctx: Context<Spin>, bet_amount: u64) -> Result<()> {
        let slots_state = &mut ctx.accounts.slots_state;
        
        require!(bet_amount > 0, ErrorCode::InvalidBetAmount);
        require!(bet_amount <= 1000000000, ErrorCode::BetTooHigh); // Max 1 SOL bet
        
        // Generate pseudo-random result (in real implementation, use VRF)
        let clock = Clock::get()?;
        let slot = clock.slot;
        let seed = slot.wrapping_add(bet_amount);
        
        // Generate 3 symbols for the middle row payline (0-7 representing different symbols)
        let symbol1 = (seed % 8) as u8;
        let symbol2 = ((seed / 8) % 8) as u8;
        let symbol3 = ((seed / 64) % 8) as u8;
        
        // Calculate payout based on middle row payline
        let payout = calculate_payout(symbol1, symbol2, symbol3, bet_amount);
        
        // Update statistics
        slots_state.total_spins += 1;
        slots_state.total_payout += payout;
        
        // Emit events
        emit!(SpinRequested {
            user: ctx.accounts.user.key(),
            bet_amount,
            symbols: [symbol1, symbol2, symbol3],
        });
        
        emit!(SpinResult {
            user: ctx.accounts.user.key(),
            symbols: [symbol1, symbol2, symbol3],
            payout,
        });
        
        Ok(())
    }

    pub fn claim_payout(ctx: Context<ClaimPayout>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        
        // Transfer tokens from treasury to user (implementation depends on token setup)
        // This is a simplified version - in practice you'd handle SOL or SPL token transfers
        
        Ok(())
    }
}

fn calculate_payout(symbol1: u8, symbol2: u8, symbol3: u8, bet_amount: u64) -> u64 {
    // Only pay out on three matching symbols in the payline
    let multiplier = if symbol1 == symbol2 && symbol2 == symbol3 {
        // Three of a kind - different multipliers based on symbol rarity
        match symbol1 {
            0 => 100, // Gorbagana (highest paying)
            1 => 50,  // Wild
            2 => 25,  // Bonus Chest
            3 => 20,  // Trash
            4 => 15,  // Takeout
            5 => 10,  // Fish
            6 => 5,   // Rat
            7 => 2,   // Banana
            _ => 0,
        }
    } else {
        // No payout for partial matches
        0
    };
    
    bet_amount * multiplier
}

#[derive(Accounts)]
pub struct Initialize {
    #[account(init, payer = user, space = 8 + 32 + 1 + 32 + 8 + 8 + 1)]
    pub slots_state: Account<'info, SlotsState>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Spin {
    #[account(mut)]
    pub slots_state: Account<'info, SlotsState>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimPayout {
    #[account(mut)]
    pub slots_state: Account<'info, SlotsState>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct SlotsState {
    pub authority: Pubkey,
    pub initialized: bool,
    pub treasury: Pubkey,
    pub total_spins: u64,
    pub total_payout: u64,
    pub house_edge: u8,
    pub max_payout_per_spin: u64,
    pub total_pool: u64,
    pub min_pool_threshold: u64,
}

#[event]
pub struct SpinRequested {
    pub user: Pubkey,
    pub bet_amount: u64,
    pub symbols: [u8; 3],
}

#[event]
pub struct SpinResult {
    pub user: Pubkey,
    pub symbols: [u8; 3],
    pub payout: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid bet amount")]
    InvalidBetAmount,
    #[msg("Bet amount too high")]
    BetTooHigh,
    #[msg("Invalid amount")]
    InvalidAmount,
}
