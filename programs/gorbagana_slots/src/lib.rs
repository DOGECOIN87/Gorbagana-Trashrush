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
        slots_state.total_wagered = 0;
        slots_state.house_profit = 0;
        slots_state.current_rtp = 9500; // 95% in basis points
        slots_state.house_edge = 5; // 5% house edge
        slots_state.max_payout_per_spin = 1000000000; // 1 SOL max initially
        slots_state.total_pool = 0;
        slots_state.min_pool_threshold = 100000000; // 0.1 SOL minimum pool
        slots_state.paused = false;
        Ok(())
    }

    pub fn spin(ctx: Context<Spin>, bet_amount: u64) -> Result<()> {
        let slots_state = &mut ctx.accounts.slots_state;

        require!(!slots_state.paused, ErrorCode::GamePaused);
        require!(bet_amount > 0, ErrorCode::InvalidBetAmount);
        require!(bet_amount <= slots_state.max_payout_per_spin, ErrorCode::BetTooHigh);
        require!(ctx.accounts.user.lamports() >= bet_amount, ErrorCode::InsufficientFunds);

        // Transfer bet amount from user to treasury
        **ctx.accounts.user.to_account_info().try_borrow_mut_lamports()? -= bet_amount;
        **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += bet_amount;

        // Update pool with bet amount
        slots_state.total_pool += bet_amount;

        // Generate weighted random result using improved randomness
        let clock = Clock::get()?;
        let slot = clock.slot;
        let recent_blockhash = clock.unix_timestamp as u64;
        let user_key = ctx.accounts.user.key().to_bytes();
        
        // Create more complex seed for better randomness
        let mut seed = slot
            .wrapping_add(bet_amount)
            .wrapping_add(recent_blockhash)
            .wrapping_add(slots_state.total_spins);
        
        // Add user key bytes to seed for additional entropy
        for (i, &byte) in user_key.iter().enumerate().take(8) {
            seed = seed.wrapping_add((byte as u64) << (i * 8));
        }

        // Generate weighted symbols based on configured probabilities
        let symbol1 = generate_weighted_symbol(seed);
        let symbol2 = generate_weighted_symbol(seed.wrapping_mul(7919)); // Prime multiplier
        let symbol3 = generate_weighted_symbol(seed.wrapping_mul(7927)); // Different prime

        // Calculate theoretical payout
        let theoretical_payout = calculate_payout(symbol1, symbol2, symbol3, bet_amount);

        // Apply RTP enforcement to guarantee 5% house edge
        let (actual_payout, house_profit) = enforce_rtp(
            theoretical_payout,
            bet_amount,
            slots_state.total_spins,
            slots_state.total_payout,
            slots_state.total_wagered,
            slots_state.house_edge
        );

        // Ensure we have sufficient pool for payout
        let final_payout = if actual_payout > 0 {
            let available_pool = slots_state.total_pool.saturating_sub(slots_state.min_pool_threshold);
            actual_payout.min(available_pool).min(slots_state.max_payout_per_spin)
        } else {
            0
        };

        // Update pool (remove payout amount)
        if final_payout > 0 {
            slots_state.total_pool = slots_state.total_pool.saturating_sub(final_payout);
        }

        // Update statistics for RTP tracking
        slots_state.total_spins += 1;
        slots_state.total_payout += final_payout;
        slots_state.total_wagered += bet_amount;
        slots_state.house_profit += house_profit;

        // Update RTP tracking
        if slots_state.total_wagered > 0 {
            slots_state.current_rtp = (slots_state.total_payout * 10000) / slots_state.total_wagered; // Basis points
        }

        // Emit events
        emit!(SpinRequested {
            user: ctx.accounts.user.key(),
            bet_amount,
            symbols: [symbol1, symbol2, symbol3],
        });

        emit!(SpinResult {
            user: ctx.accounts.user.key(),
            symbols: [symbol1, symbol2, symbol3],
            payout: final_payout,
            house_edge_actual: if bet_amount > 0 { ((bet_amount - final_payout) * 10000) / bet_amount } else { 0 },
        });

        // Emit RTP update event
        emit!(RTPUpdate {
            total_spins: slots_state.total_spins,
            current_rtp: slots_state.current_rtp,
            house_profit: slots_state.house_profit,
            total_wagered: slots_state.total_wagered,
        });

        Ok(())
    }

    pub fn claim_payout(ctx: Context<ClaimPayout>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);

        // Transfer tokens from treasury to user
        **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.user.to_account_info().try_borrow_mut_lamports()? += amount;

        Ok(())
    }

    pub fn add_to_pool(ctx: Context<AddToPool>, amount: u64) -> Result<()> {
        let slots_state = &mut ctx.accounts.slots_state;

        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(ctx.accounts.user.lamports() >= amount, ErrorCode::InsufficientFunds);

        // Transfer amount from user to treasury
        **ctx.accounts.user.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += amount;

        // Update pool
        slots_state.total_pool += amount;

        emit!(PoolDeposit {
            user: ctx.accounts.user.key(),
            amount,
            new_pool: slots_state.total_pool,
        });

        Ok(())
    }

    pub fn emergency_pause(ctx: Context<EmergencyPause>) -> Result<()> {
        let slots_state = &mut ctx.accounts.slots_state;
        require!(ctx.accounts.authority.key() == slots_state.authority, ErrorCode::Unauthorized);

        slots_state.paused = !slots_state.paused;

        emit!(EmergencyAction {
            action: if slots_state.paused { "paused" } else { "resumed" }.to_string(),
            authority: ctx.accounts.authority.key(),
        });

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

fn generate_weighted_symbol(seed: u64) -> u8 {
    // Symbol weights: [1, 2, 3, 4, 5, 6, 7, 8] for symbols [0, 1, 2, 3, 4, 5, 6, 7]
    // Total weight = 36
    let weights = [1, 2, 3, 4, 5, 6, 7, 8];
    let total_weight = 36;
    
    let random_value = seed % total_weight;
    let mut cumulative_weight = 0;
    
    for (symbol, &weight) in weights.iter().enumerate() {
        cumulative_weight += weight;
        if random_value < cumulative_weight {
            return symbol as u8;
        }
    }
    
    // Fallback (should never reach here)
    7 // Return banana as default
}

fn enforce_rtp(
    theoretical_payout: u64,
    bet_amount: u64,
    total_spins: u64,
    total_payout: u64,
    total_wagered: u64,
    target_house_edge: u8,
) -> (u64, u64) {
    // If this is early in the game (< 100 spins), use theoretical payout
    if total_spins < 100 {
        let house_profit = bet_amount.saturating_sub(theoretical_payout);
        return (theoretical_payout, house_profit);
    }
    
    // Calculate current RTP
    let current_rtp = if total_wagered > 0 {
        (total_payout * 10000) / total_wagered // In basis points
    } else {
        9500 // Default to 95% RTP
    };
    
    let target_rtp = (100 - target_house_edge as u64) * 100; // Target RTP in basis points
    let tolerance = 50; // 0.5% tolerance in basis points
    
    // If RTP is within tolerance, use theoretical payout
    if current_rtp >= target_rtp.saturating_sub(tolerance) && current_rtp <= target_rtp + tolerance {
        let house_profit = bet_amount.saturating_sub(theoretical_payout);
        return (theoretical_payout, house_profit);
    }
    
    // Calculate adjustment needed
    let new_total_wagered = total_wagered + bet_amount;
    let target_total_payout = (new_total_wagered * target_rtp) / 10000;
    let needed_payout = target_total_payout.saturating_sub(total_payout);
    
    // Apply bounds to the adjustment
    let max_adjustment = bet_amount * 2; // Don't pay more than 2x bet
    let adjusted_payout = needed_payout.min(max_adjustment).min(theoretical_payout * 2);
    
    // Ensure we don't go negative
    let final_payout = if adjusted_payout > bet_amount * 10 {
        // Cap extremely high payouts to 10x bet
        bet_amount * 10
    } else {
        adjusted_payout
    };
    
    let house_profit = bet_amount.saturating_sub(final_payout);
    (final_payout, house_profit)
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, space = 8 + 32 + 1 + 32 + 8 + 8 + 8 + 8 + 8 + 1 + 8 + 8 + 8 + 1)]
    pub slots_state: Account<'info, SlotsState>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Spin<'info> {
    #[account(mut)]
    pub slots_state: Account<'info, SlotsState>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub treasury: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
    #[account(mut)]
    pub slots_state: Account<'info, SlotsState>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub treasury: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddToPool<'info> {
    #[account(mut)]
    pub slots_state: Account<'info, SlotsState>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub treasury: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EmergencyPause<'info> {
    #[account(mut)]
    pub slots_state: Account<'info, SlotsState>,
    pub authority: Signer<'info>,
}

#[account]
pub struct SlotsState {
    pub authority: Pubkey,
    pub initialized: bool,
    pub treasury: Pubkey,
    pub total_spins: u64,
    pub total_payout: u64,
    pub total_wagered: u64,
    pub house_profit: u64,
    pub current_rtp: u64, // RTP in basis points (9500 = 95%)
    pub house_edge: u8,
    pub max_payout_per_spin: u64,
    pub total_pool: u64,
    pub min_pool_threshold: u64,
    pub paused: bool,
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
    pub house_edge_actual: u64,
}

#[event]
pub struct RTPUpdate {
    pub total_spins: u64,
    pub current_rtp: u64,
    pub house_profit: u64,
    pub total_wagered: u64,
}

#[event]
pub struct PoolDeposit {
    pub user: Pubkey,
    pub amount: u64,
    pub new_pool: u64,
}

#[event]
pub struct EmergencyAction {
    pub action: String,
    pub authority: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid bet amount")]
    InvalidBetAmount,
    #[msg("Bet amount too high")]
    BetTooHigh,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Insufficient pool funds")]
    InsufficientPool,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Game is currently paused")]
    GamePaused,
}
