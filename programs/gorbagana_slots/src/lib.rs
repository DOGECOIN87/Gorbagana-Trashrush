use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

declare_id!("BqF33RrRRXQ78AtU98kXGyLNuCgd1zmNd4HCJBoJf5G5");

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

        // Update pool
        slots_state.total_pool += bet_amount;

        // Generate pseudo-random result (in real implementation, use VRF)
        let clock = Clock::get()?;
        let slot = clock.slot;
        let recent_blockhash = clock.unix_timestamp as u64;
        let seed = slot.wrapping_add(bet_amount).wrapping_add(recent_blockhash);

        // Generate 3 symbols for the middle row payline (0-7 representing different symbols)
        let symbol1 = (seed % 8) as u8;
        let symbol2 = ((seed / 8) % 8) as u8;
        let symbol3 = ((seed / 64) % 8) as u8;

        // Calculate payout based on middle row payline
        let payout = calculate_payout(symbol1, symbol2, symbol3, bet_amount);

        // Apply house edge (5% goes to house, 95% available for payouts)
        let house_cut = bet_amount * slots_state.house_edge as u64 / 100;
        let available_payout = bet_amount - house_cut;

        // Cap payout at available pool and max payout limit
        let actual_payout = payout.min(available_payout).min(slots_state.max_payout_per_spin);

        // Update pool (remove payout amount)
        if actual_payout > 0 {
            require!(slots_state.total_pool >= actual_payout, ErrorCode::InsufficientPool);
            slots_state.total_pool -= actual_payout;
        }

        // Update statistics
        slots_state.total_spins += 1;
        slots_state.total_payout += actual_payout;

        // Emit events
        emit!(SpinRequested {
            user: ctx.accounts.user.key(),
            bet_amount,
            symbols: [symbol1, symbol2, symbol3],
        });

        emit!(SpinResult {
            user: ctx.accounts.user.key(),
            symbols: [symbol1, symbol2, symbol3],
            payout: actual_payout,
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

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, space = 8 + 32 + 1 + 32 + 8 + 8 + 1 + 8 + 8 + 8 + 1)]
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
