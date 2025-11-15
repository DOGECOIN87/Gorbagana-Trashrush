use anchor_lang::{prelude::*, system_program};
use switchboard_on_demand::on_demand::accounts::RandomnessAccountData;
use core::convert::TryInto;
use std::str::FromStr;

declare_id!("Fg6PaFpoGXkYsidMpWxTWqkq5tqMZf7Q6Y3hftsz5A5c"); // TODO: replace with your real program id

/// Switchboard On-Demand program id (devnet + mainnet-beta).
/// Source: Switchboard On-Demand randomness service docs. 0
pub const SWITCHBOARD_ON_DEMAND_PROGRAM_ID_STR: &str =
    "RANDMo5gFnqnXJW5Z52KNmd24sAo95KAd5VbiCtq5Rh";

// =========================
// CONFIG / CONSTANTS
// =========================

pub const SYMBOL_COUNT: usize = 12;
pub const TOTAL_WEIGHT: u64 = 78;

// Weights: higher = more common symbol.
pub const SYMBOL_WEIGHTS: [u64; SYMBOL_COUNT] = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
];

// 3-of-a-kind multipliers (× bet) for symbols 0..11.
pub const SYMBOL_PAYOUTS_3OAK: [u64; SYMBOL_COUNT] = [
    553, // symbol 0 (rarest)
    387, // 1
    276, // 2
    221, // 3
    166, // 4
    124, // 5
    97,  // 6
    69,  // 7
    55,  // 8
    41,  // 9
    28,  // 10
    14,  // 11 (most common)
];

/// A single progressive jackpot pool (e.g. Mini / Major / Grand)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct JackpotPool {
    /// Current jackpot amount (lamports) available to be won.
    pub amount: u64,
    /// Seed amount (lamports) after reset when hit.
    pub seed: u64,
    /// Contribution per paid bet (basis points of bet).
    /// e.g. 100 = 1% of bet.
    pub contrib_bps: u16,
    /// Selection weight when a jackpot hit occurs.
    pub hit_weight: u32,
}

/// All jackpots combined
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct JackpotsConfig {
    pub mini: JackpotPool,
    pub major: JackpotPool,
    pub grand: JackpotPool,
    /// Sum of mini + major + grand hit weights.
    pub hit_weight_total: u32,
}

// =========================
// ACCOUNT STATE
// =========================

#[account]
pub struct SlotsState {
    /// Admin authority.
    pub authority: Pubkey,
    /// Treasury PDA (holds game funds + pool).
    pub treasury: Pubkey,

    pub initialized: bool;
    pub paused: bool;

    // RTP stats
    pub total_spins: u64,
    pub total_wagered: u64,
    pub total_payout: u64,
    pub house_profit: u64,
    /// Current RTP, basis points (e.g. 9550 = 95.50%).
    pub current_rtp_bps: u32,

    /// Optional target house edge, basis points.
    pub house_edge_bps: u16,

    // Pool accounting
    pub total_pool: u64,
    pub max_payout_per_spin: u64,
    pub min_pool_threshold: u64,

    // Progressive jackpots
    pub jackpots: JackpotsConfig,
}

/// Per-player state. A player can have **one pending spin**
/// tied to a Switchboard randomness account.
#[account]
pub struct PlayerState {
    pub owner: Pubkey,
    pub bump: u8,

    /// Randomness account currently committed for a spin (if any).
    pub randomness_account: Pubkey,
    /// Bet amount for pending spin.
    pub pending_bet_amount: u64,
    /// True if there is a pending spin waiting for VRF reveal.
    pub has_pending_spin: bool,
}

// =========================
// EVENTS
// =========================

#[event]
pub struct SpinCommitted {
    pub user: Pubkey,
    pub bet_amount: u64,
    pub randomness_account: Pubkey,
}

#[event]
pub struct SpinSettled {
    pub user: Pubkey,
    pub randomness_account: Pubkey,
    pub symbols: [u8; 3],
    pub base_payout: u64,
    pub jackpot_payout: u64,
    pub total_payout: u64,
}

#[event]
pub struct RTPUpdate {
    pub total_spins: u64,
    pub total_wagered: u64,
    pub total_payout: u64,
    pub house_profit: u64,
    pub current_rtp_bps: u32,
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

// =========================
// ERRORS
// =========================

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
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Game is paused")]
    GamePaused,
    #[msg("Slots state not initialized")]
    Uninitialized,
    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Player state not initialized")]
    PlayerStateMissing,
    #[msg("Player already has a pending spin")]
    PendingSpinExists,
    #[msg("No pending spin for this player")]
    NoPendingSpin,
    #[msg("Randomness account does not match player state")]
    RandomnessAccountMismatch,
    #[msg("Randomness account parse failed")]
    RandomnessParseFailed,
    #[msg("Randomness not yet revealed or invalid seed slot")]
    RandomnessNotResolved,
}

// =========================
// PROGRAM
// =========================

#[program]
pub mod gorbagana_slots_vrf {
    use super::*;

    /// Initialize global game state + jackpots + treasury PDA.
    pub fn initialize(ctx: Context<Initialize>, authority: Pubkey) -> Result<()> {
        let slots_state = &mut ctx.accounts.slots_state;

        slots_state.authority = authority;
        slots_state.treasury = ctx.accounts.treasury.key();
        slots_state.initialized = true;
        slots_state.paused = false;

        slots_state.total_spins = 0;
        slots_state.total_wagered = 0;
        slots_state.total_payout = 0;
        slots_state.house_profit = 0;
        slots_state.current_rtp_bps = 0;
        slots_state.house_edge_bps = 500; // 5% target (informational)

        slots_state.total_pool = 0;
        slots_state.max_payout_per_spin = 1_000_000_000; // 1 SOL (example)
        slots_state.min_pool_threshold = 100_000_000;    // 0.1 SOL

        // Example jackpots config – tune for your RTP.
        let mini_seed = 10_000_000;      // 0.01 SOL
        let major_seed = 100_000_000;    // 0.1 SOL
        let grand_seed = 1_000_000_000;  // 1 SOL

        slots_state.jackpots = JackpotsConfig {
            mini: JackpotPool {
                amount: mini_seed,
                seed: mini_seed,
                contrib_bps: 50, // 0.5% of bet
                hit_weight: 500,
            },
            major: JackpotPool {
                amount: major_seed,
                seed: major_seed,
                contrib_bps: 100, // 1.0% of bet
                hit_weight: 300,
            },
            grand: JackpotPool {
                amount: grand_seed,
                seed: grand_seed,
                contrib_bps: 50, // 0.5% of bet
                hit_weight: 200,
            },
            hit_weight_total: 500 + 300 + 200,
        };

        Ok(())
    }

    /// Initialize per-player state (PDA).
    pub fn init_player(ctx: Context<InitPlayer>) -> Result<()> {
        let slots_state = &ctx.accounts.slots_state;
        require!(slots_state.initialized, ErrorCode::Uninitialized);

        let player_state = &mut ctx.accounts.player_state;
        player_state.owner = ctx.accounts.user.key();
        player_state.bump = *ctx.bumps.get("player_state").unwrap();
        player_state.randomness_account = Pubkey::default();
        player_state.pending_bet_amount = 0;
        player_state.has_pending_spin = false;
        Ok(())
    }

    /// STEP 1: Commit to a spin.
    pub fn request_spin(
        ctx: Context<RequestSpin>,
        randomness_account: Pubkey,
        bet_amount: u64,
    ) -> Result<()> {
        let slots_state = &mut ctx.accounts.slots_state;
        let player_state = &mut ctx.accounts.player_state;
        let user = &ctx.accounts.user;
        let treasury = &ctx.accounts.treasury;
        let randomness_ai = &ctx.accounts.randomness_account_data;

        require!(slots_state.initialized, ErrorCode::Uninitialized);
        require!(!slots_state.paused, ErrorCode::GamePaused);
        require!(bet_amount > 0, ErrorCode::InvalidBetAmount);
        require!(
            bet_amount <= slots_state.max_payout_per_spin,
            ErrorCode::BetTooHigh
        );
        require!(!player_state.has_pending_spin, ErrorCode::PendingSpinExists);

        // Ensure randomness account matches parameter and is owned by Switchboard.
        require_keys_eq!(
            randomness_account,
            randomness_ai.key(),
            ErrorCode::RandomnessAccountMismatch
        );
        let expected_sb_pid = Pubkey::from_str(SWITCHBOARD_ON_DEMAND_PROGRAM_ID_STR)
            .map_err(|_| ErrorCode::RandomnessParseFailed)?;
        require_keys_eq!(
            *randomness_ai.owner,
            expected_sb_pid,
            ErrorCode::RandomnessAccountMismatch
        );

        // Ensure user has enough funds for bet.
        require!(user.lamports() >= bet_amount, ErrorCode::InsufficientFunds);

        // Ensure pool is sufficiently funded to cover min threshold + max payout
        // BEFORE accepting a new bet (fairness best-practice).
        let required_pool = slots_state
            .min_pool_threshold
            .saturating_add(slots_state.max_payout_per_spin);
        require!(
            slots_state.total_pool >= required_pool,
            ErrorCode::InsufficientPool
        );
        require!(
            treasury.lamports() >= required_pool,
            ErrorCode::InsufficientPool
        );

        // Basic freshness check: allow same-slot or previous-slot commit.
        let clock = Clock::get()?;
        let randomness_data = RandomnessAccountData::parse(randomness_ai.data.borrow())
            .map_err(|_| ErrorCode::RandomnessParseFailed)?;

        let seed_slot = randomness_data.seed_slot;
        let current_slot = clock.slot;
        require!(
            seed_slot == current_slot || seed_slot == current_slot.saturating_sub(1),
            ErrorCode::RandomnessNotResolved
        );

        // Transfer bet user -> treasury (user signs, no PDA needed).
        let transfer_accounts = system_program::Transfer {
            from: user.to_account_info(),
            to: treasury.to_account_info(),
        };
        let transfer_ctx =
            CpiContext::new(ctx.accounts.system_program.to_account_info(), transfer_accounts);
        system_program::transfer(transfer_ctx, bet_amount)?;

        // Update accounting
        slots_state.total_wagered = slots_state
            .total_wagered
            .checked_add(bet_amount)
            .ok_or(ErrorCode::MathOverflow)?;
        slots_state.total_pool = slots_state
            .total_pool
            .checked_add(bet_amount)
            .ok_or(ErrorCode::MathOverflow)?;

        // Jackpot contributions (accounting only, still in treasury)
        apply_jackpot_contributions(slots_state, bet_amount)?;

        // Store pending spin in player_state
        player_state.randomness_account = randomness_account;
        player_state.pending_bet_amount = bet_amount;
        player_state.has_pending_spin = true;

        emit!(SpinCommitted {
            user: user.key(),
            bet_amount,
            randomness_account,
        });

        Ok(())
    }

    /// STEP 2: Settle a previously committed spin using Switchboard VRF.
    pub fn settle_spin(ctx: Context<SettleSpin>) -> Result<()> {
        let slots_state = &mut ctx.accounts.slots_state;
        let player_state = &mut ctx.accounts.player_state;
        let user = &ctx.accounts.user;
        let treasury = &ctx.accounts.treasury;
        let randomness_ai = &ctx.accounts.randomness_account_data;

        require!(slots_state.initialized, ErrorCode::Uninitialized);
        require!(!slots_state.paused, ErrorCode::GamePaused);
        require!(player_state.has_pending_spin, ErrorCode::NoPendingSpin);

        // Ensure we are settling the correct randomness account and that it is Switchboard-owned.
        require_keys_eq!(
            player_state.randomness_account,
            randomness_ai.key(),
            ErrorCode::RandomnessAccountMismatch
        );
        let expected_sb_pid = Pubkey::from_str(SWITCHBOARD_ON_DEMAND_PROGRAM_ID_STR)
            .map_err(|_| ErrorCode::RandomnessParseFailed)?;
        require_keys_eq!(
            *randomness_ai.owner,
            expected_sb_pid,
            ErrorCode::RandomnessAccountMismatch
        );

        let bet_amount = player_state.pending_bet_amount;
        require!(bet_amount > 0, ErrorCode::InvalidBetAmount);

        // =========================
        // READ VRF RANDOMNESS
        // =========================
        let clock = Clock::get()?;
        let randomness_data = RandomnessAccountData::parse(randomness_ai.data.borrow())
            .map_err(|_| ErrorCode::RandomnessParseFailed)?;

        // Get the 32 bytes of random data for this slot
        let random_bytes = randomness_data
            .get_value(clock.slot)
            .map_err(|_| ErrorCode::RandomnessNotResolved)?;

        // Turn first 8 bytes into a u64 seed.
        let mut seed: u64 = u64::from_le_bytes(
            random_bytes[0..8]
                .try_into()
                .map_err(|_| ErrorCode::RandomnessParseFailed)?,
        );

        // =========================
        // SYMBOLS + BASE PAYOUT (3-OAK ONLY)
        // =========================
        let s1 = generate_weighted_symbol(next_random_u64(&mut seed));
        let s2 = generate_weighted_symbol(next_random_u64(&mut seed));
        let s3 = generate_weighted_symbol(next_random_u64(&mut seed));

        let base_payout_full = calculate_payout_3oak([s1, s2, s3], bet_amount);

        // =========================
        // GLOBAL CAPS & POOL LIMITS
        // =========================
        // Compute how much we can afford to pay in TOTAL this spin,
        // before considering jackpots, to avoid burning jackpot amounts.
        let available_pool = slots_state
            .total_pool
            .saturating_sub(slots_state.min_pool_threshold);
        let cap_by_house = slots_state.max_payout_per_spin;
        let max_total_affordable = core::cmp::min(available_pool, cap_by_house);

        // If we can't pay anything, no payout (including jackpots).
        if max_total_affordable == 0 {
            // Update stats & clear pending spin, then exit cleanly.
            slots_state.total_spins = slots_state
                .total_spins
                .checked_add(1)
                .ok_or(ErrorCode::MathOverflow)?;

            // house_profit = total_wagered - total_payout, saturating.
            slots_state.house_profit =
                slots_state.total_wagered.saturating_sub(slots_state.total_payout);

            if slots_state.total_wagered > 0 {
                slots_state.current_rtp_bps = ((slots_state.total_payout as u128)
                    .saturating_mul(10_000)
                    / (slots_state.total_wagered as u128)) as u32;
            }

            emit!(SpinSettled {
                user: user.key(),
                randomness_account: randomness_ai.key(),
                symbols: [s1, s2, s3],
                base_payout: 0,
                jackpot_payout: 0,
                total_payout: 0,
            });

            emit!(RTPUpdate {
                total_spins: slots_state.total_spins,
                total_wagered: slots_state.total_wagered,
                total_payout: slots_state.total_payout,
                house_profit: slots_state.house_profit,
                current_rtp_bps: slots_state.current_rtp_bps,
            });

            player_state.has_pending_spin = false;
            player_state.pending_bet_amount = 0;
            player_state.randomness_account = Pubkey::default();

            return Ok(());
        }

        // First cap the base payout by what we can afford.
        let base_payout = core::cmp::min(base_payout_full, max_total_affordable);

        // Remaining capacity for jackpots this spin.
        let remaining_for_jackpot = max_total_affordable.saturating_sub(base_payout);

        // =========================
        // JACKPOT (if affordable)
        // =========================
        let jackpot_payout = if remaining_for_jackpot > 0 {
            maybe_hit_jackpot(slots_state, &mut seed, remaining_for_jackpot)?
        } else {
            0
        };

        let total_payout = base_payout
            .checked_add(jackpot_payout)
            .ok_or(ErrorCode::MathOverflow)?;

        // Transfer payout from treasury PDA -> user, signing as PDA.
        if total_payout > 0 {
            require!(
                treasury.lamports() >= total_payout,
                ErrorCode::InsufficientPool
            );
            require!(
                slots_state.total_pool >= total_payout,
                ErrorCode::InsufficientPool
            );

            let payout_accounts = system_program::Transfer {
                from: treasury.to_account_info(),
                to: user.to_account_info(),
            };
            let treasury_bump = *ctx.bumps.get("treasury").unwrap();
            let signer_seeds: &[&[u8]] = &[b"treasury", &[treasury_bump]];

            let payout_ctx = CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                payout_accounts,
            )
            .with_signer(&[signer_seeds]);
            system_program::transfer(payout_ctx, total_payout)?;

            slots_state.total_payout = slots_state
                .total_payout
                .checked_add(total_payout)
                .ok_or(ErrorCode::MathOverflow)?;
            slots_state.total_pool = slots_state
                .total_pool
                .checked_sub(total_payout)
                .ok_or(ErrorCode::MathOverflow)?;
        }

        // =========================
        // RTP STATS
        // =========================
        slots_state.total_spins = slots_state
            .total_spins
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;

        // Use saturating_sub so we never underflow if payouts exceed wagers.
        slots_state.house_profit = slots_state
            .total_wagered
            .saturating_sub(slots_state.total_payout);

        if slots_state.total_wagered > 0 {
            slots_state.current_rtp_bps = ((slots_state.total_payout as u128)
                .saturating_mul(10_000)
                / (slots_state.total_wagered as u128)) as u32;
        }

        emit!(SpinSettled {
            user: user.key(),
            randomness_account: randomness_ai.key(),
            symbols: [s1, s2, s3],
            base_payout,
            jackpot_payout,
            total_payout,
        });

        emit!(RTPUpdate {
            total_spins: slots_state.total_spins,
            total_wagered: slots_state.total_wagered,
            total_payout: slots_state.total_payout,
            house_profit: slots_state.house_profit,
            current_rtp_bps: slots_state.current_rtp_bps,
        });

        // Clear pending spin
        player_state.has_pending_spin = false;
        player_state.pending_bet_amount = 0;
        player_state.randomness_account = Pubkey::default();

        Ok(())
    }

    /// Anyone can top up the pool (deposits go via treasury).
    pub fn add_to_pool(ctx: Context<AddToPool>, amount: u64) -> Result<()> {
        let slots_state = &mut ctx.accounts.slots_state;
        let user = &ctx.accounts.user;
        let treasury = &ctx.accounts.treasury;

        require!(slots_state.initialized, ErrorCode::Uninitialized);
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(user.lamports() >= amount, ErrorCode::InsufficientFunds);

        let transfer_accounts = system_program::Transfer {
            from: user.to_account_info(),
            to: treasury.to_account_info(),
        };
        let transfer_ctx =
            CpiContext::new(ctx.accounts.system_program.to_account_info(), transfer_accounts);
        system_program::transfer(transfer_ctx, amount)?;

        slots_state.total_pool = slots_state
            .total_pool
            .checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;

        emit!(PoolDeposit {
            user: user.key(),
            amount,
            new_pool: slots_state.total_pool,
        });

        Ok(())
    }

    /// Authority-only withdrawal from the pool.
    /// Respects min_pool_threshold **and** jackpot balances so operator
    /// cannot drain reserves required to pay jackpots.
    pub fn claim_payout(ctx: Context<ClaimPayout>, amount: u64) -> Result<()> {
        let slots_state = &mut ctx.accounts.slots_state;
        let authority = &ctx.accounts.authority;
        let treasury = &ctx.accounts.treasury;

        require!(slots_state.initialized, ErrorCode::Uninitialized);
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(
            authority.key() == slots_state.authority,
            ErrorCode::Unauthorized
        );

        // Compute total jackpot balances.
        let jackpot_total = total_jackpot_amounts(&slots_state.jackpots)?;

        // Funds that must remain in the pool:
        // min_pool_threshold + full jackpot balances.
        let must_keep = slots_state
            .min_pool_threshold
            .checked_add(jackpot_total)
            .ok_or(ErrorCode::MathOverflow)?;

        // Amount actually available for withdrawal.
        let available_for_claim = slots_state.total_pool.saturating_sub(must_keep);
        require!(amount <= available_for_claim, ErrorCode::InsufficientPool);
        require!(
            treasury.lamports() >= amount,
            ErrorCode::InsufficientPool
        );

        let new_pool = slots_state
            .total_pool
            .checked_sub(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        slots_state.total_pool = new_pool;

        let payout_accounts = system_program::Transfer {
            from: treasury.to_account_info(),
            to: authority.to_account_info(),
        };
        let treasury_bump = *ctx.bumps.get("treasury").unwrap();
        let signer_seeds: &[&[u8]] = &[b"treasury", &[treasury_bump]];

        let payout_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            payout_accounts,
        )
        .with_signer(&[signer_seeds]);
        system_program::transfer(payout_ctx, amount)?;

        Ok(())
    }

    /// Pause/unpause game (admin only).
    pub fn emergency_pause(ctx: Context<EmergencyPause>) -> Result<()> {
        let slots_state = &mut ctx.accounts.slots_state;
        let authority = &ctx.accounts.authority;

        require!(slots_state.initialized, ErrorCode::Uninitialized);
        require!(
            authority.key() == slots_state.authority,
            ErrorCode::Unauthorized
        );

        slots_state.paused = !slots_state.paused;

        emit!(EmergencyAction {
            action: if slots_state.paused {
                "paused".to_string()
            } else {
                "resumed".to_string()
            },
            authority: authority.key(),
        });

        Ok(())
    }
}

// =========================
// ACCOUNT CONTEXTS
// =========================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + 1024, // plenty; tighten for production
    )]
    pub slots_state: Account<'info, SlotsState>,

    /// PDA treasury vault for SOL (program-signable via seeds).
    #[account(
        init,
        payer = payer,
        seeds = [b"treasury"],
        bump,
        space = 8, // no data needed, just rent-exempt holder
    )]
    pub treasury: SystemAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitPlayer<'info> {
    #[account(
        mut,
        has_one = treasury
    )]
    pub slots_state: Account<'info, SlotsState>,

    #[account(
        init,
        payer = user,
        seeds = [b"player", user.key().as_ref()],
        bump,
        space = 8 + 32 + 1 + 32 + 8 + 1, // PlayerState size
    )]
    pub player_state: Account<'info, PlayerState>,

    #[account(mut)]
    pub user: Signer<'info>,

    /// Treasury PDA vault – must be same as in slots_state.
    #[account(
        mut,
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RequestSpin<'info> {
    #[account(
        mut,
        has_one = treasury
    )]
    pub slots_state: Account<'info, SlotsState>,

    #[account(
        mut,
        seeds = [b"player", user.key().as_ref()],
        bump = player_state.bump,
        constraint = player_state.owner == user.key() @ ErrorCode::Unauthorized
    )]
    pub player_state: Account<'info, PlayerState>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    /// CHECK: Switchboard randomness account
    #[account(mut)]
    pub randomness_account_data: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleSpin<'info> {
    #[account(
        mut,
        has_one = treasury
    )]
    pub slots_state: Account<'info, SlotsState>,

    #[account(
        mut,
        seeds = [b"player", user.key().as_ref()],
        bump = player_state.bump,
        constraint = player_state.owner == user.key() @ ErrorCode::Unauthorized
    )]
    pub player_state: Account<'info, PlayerState>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    /// CHECK: same randomness account used in request_spin
    #[account(mut)]
    pub randomness_account_data: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddToPool<'info> {
    #[account(
        mut,
        has_one = treasury
    )]
    pub slots_state: Account<'info, SlotsState>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
    #[account(
        mut,
        has_one = treasury
    )]
    pub slots_state: Account<'info, SlotsState>,

    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EmergencyPause<'info> {
    #[account(mut)]
    pub slots_state: Account<'info, SlotsState>,
    pub authority: Signer<'info>,
}

// =========================
// INTERNAL HELPERS
// =========================

/// Simple LCG-based PRNG to expand a single VRF seed
/// into multiple 64-bit random values.
fn next_random_u64(seed: &mut u64) -> u64 {
    const A: u64 = 6364136223846793005;
    const C: u64 = 1;
    *seed = seed.wrapping_mul(A).wrapping_add(C);
    *seed
}

/// Sample a reel symbol index [0, SYMBOL_COUNT) using SYMBOL_WEIGHTS.
fn generate_weighted_symbol(random_u64: u64) -> u8 {
    let mut r = random_u64 % TOTAL_WEIGHT;
    for (idx, &w) in SYMBOL_WEIGHTS.iter().enumerate() {
        if r < w {
            return idx as u8;
        }
        r -= w;
    }
    (SYMBOL_COUNT - 1) as u8
}

/// Only pay 3-of-a-kind wins. No 2-of-a-kind payouts.
fn calculate_payout_3oak(symbols: [u8; 3], bet_amount: u64) -> u64 {
    let [s1, s2, s3] = symbols;

    if s1 as usize >= SYMBOL_COUNT
        || s2 as usize >= SYMBOL_COUNT
        || s3 as usize >= SYMBOL_COUNT
    {
        return 0;
    }

    if s1 == s2 && s2 == s3 {
        let idx = s1 as usize;
        let mult = SYMBOL_PAYOUTS_3OAK[idx];
        return bet_amount.saturating_mul(mult);
    }

    0
}

/// Update jackpot pool accounting (contribution from bet).
fn apply_jackpot_contributions(slots_state: &mut SlotsState, bet_amount: u64) -> Result<()> {
    let mini_contrib = (bet_amount as u128)
        .saturating_mul(slots_state.jackpots.mini.contrib_bps as u128)
        / 10_000;
    let major_contrib = (bet_amount as u128)
        .saturating_mul(slots_state.jackpots.major.contrib_bps as u128)
        / 10_000;
    let grand_contrib = (bet_amount as u128)
        .saturating_mul(slots_state.jackpots.grand.contrib_bps as u128)
        / 10_000;

    slots_state.jackpots.mini.amount = slots_state
        .jackpots
        .mini
        .amount
        .checked_add(mini_contrib as u64)
        .ok_or(ErrorCode::MathOverflow)?;
    slots_state.jackpots.major.amount = slots_state
        .jackpots
        .major
        .amount
        .checked_add(major_contrib as u64)
        .ok_or(ErrorCode::MathOverflow)?;
    slots_state.jackpots.grand.amount = slots_state
        .jackpots
        .grand
        .amount
        .checked_add(grand_contrib as u64)
        .ok_or(ErrorCode::MathOverflow)?;
    Ok(())
}

/// Sum all jackpot amounts safely.
fn total_jackpot_amounts(jackpots: &JackpotsConfig) -> Result<u64> {
    let sum1 = jackpots
        .mini
        .amount
        .checked_add(jackpots.major.amount)
        .ok_or(ErrorCode::MathOverflow)?;
    let sum2 = sum1
        .checked_add(jackpots.grand.amount)
        .ok_or(ErrorCode::MathOverflow)?;
    Ok(sum2)
}

/// Randomly choose whether a jackpot hits, and which one,
/// using the VRF-derived seed.
/// Only award a jackpot if the FULL jackpot amount is affordable
/// (no partial jackpots and no silent "burning" of amounts).
fn maybe_hit_jackpot(
    slots_state: &mut SlotsState,
    seed: &mut u64,
    max_jackpot_payout: u64,
) -> Result<u64> {
    let hit_total = slots_state.jackpots.hit_weight_total;
    if hit_total == 0 || max_jackpot_payout == 0 {
        return Ok(0);
    }

    let r = (next_random_u64(seed) as u32) % hit_total;

    let mut acc = slots_state.jackpots.mini.hit_weight;
    if r < acc {
        return Ok(award_jackpot(&mut slots_state.jackpots.mini, max_jackpot_payout));
    }

    acc += slots_state.jackpots.major.hit_weight;
    if r < acc {
        return Ok(award_jackpot(&mut slots_state.jackpots.major, max_jackpot_payout));
    }

    acc += slots_state.jackpots.grand.hit_weight;
    if r < acc {
        return Ok(award_jackpot(&mut slots_state.jackpots.grand, max_jackpot_payout));
    }

    Ok(0)
}

/// Award a jackpot if and only if the pool's `amount`
/// is <= `max_jackpot_payout`. Otherwise, do not award.
fn award_jackpot(pool: &mut JackpotPool, max_jackpot_payout: u64) -> u64 {
    if pool.amount == 0 {
        return 0;
    }

    // If we can't afford to pay the full jackpot, treat as no hit.
    if pool.amount > max_jackpot_payout {
        return 0;
    }

    let amount = pool.amount;
    pool.amount = pool.seed;
    amount
}
