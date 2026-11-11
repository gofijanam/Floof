//! Devnet fair-window escrow. LaunchLab initialization and purchase are atomic.
//! Failed/stalled windows permit refunds; no admin can withdraw pledge principal.
#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{sysvar::instructions::{load_current_index_checked,load_instruction_at_checked}};
use anchor_spl::token::{self,Mint,Token,TokenAccount,Transfer};
// Build-only identifier. Generate a deployment keypair and synchronize before any deployment.
declare_id!("7hhrC7N6FRQyQLUbr4q9q5Dgqgj8zoDtDCiCd8m1XX3N");
const SUPPLY:u64=1_000_000_000_000_000;
const OPEN:u8=0; const LIVE:u8=1; const REFUNDING:u8=2;
mod compensation;
use compensation::*;
mod launchlab;
use launchlab::*;
mod rewards;
use rewards::*;
/// Configurable cap on `max_raise + creator_buy` (lamports, gross of LaunchLab's 1% fee).
/// The standard LaunchLab curve completes at 85 SOL net of fees (~85.86 SOL gross), so 86 SOL
/// lets a window buy the whole curve; any quote LaunchLab does not consume is refunded pro-rata.
pub const MAX_FIRST_BUY:u64=86_000_000_000;
/// Smallest meaningful first buy (raise + creator buy).
pub const MIN_FIRST_BUY:u64=10_000_000;
#[program]
pub mod floof_escrow {
 use super::*;
 pub fn initialize(ctx:Context<Initialize>,attestor:Pubkey,oracle_a:Pubkey,oracle_b:Pubkey)->Result<()>{
  require!(attestor!=Pubkey::default()&&oracle_a!=oracle_b&&oracle_a!=Pubkey::default()&&oracle_b!=Pubkey::default(),ErrCode::Config);
  launchlab::configuration(&ctx.accounts.global,&ctx.accounts.platform,&ctx.accounts.authority.key())?;
  let c=&mut ctx.accounts.config;c.global=ctx.accounts.global.key();c.platform=ctx.accounts.platform.key();c.fee_owner=ctx.accounts.authority.key();c.authority=ctx.accounts.authority.key();c.attestor=attestor;c.oracle_a=oracle_a;c.oracle_b=oracle_b;c.bump=ctx.bumps.config;Ok(())
 }
 pub fn fund_scout_epoch(ctx:Context<FundScoutEpoch>,epoch:u64,root:[u8;32],budget:u64)->Result<()>{rewards::fund(ctx,epoch,root,budget)}
 pub fn claim_scout(ctx:Context<ClaimScout>,amount:u64,proof:Vec<[u8;32]>)->Result<()>{rewards::claim(ctx,amount,proof)}
 pub fn claim_refund(ctx:Context<ClaimRefund>)->Result<()>{
  let w=&ctx.accounts.window;let p=&mut ctx.accounts.pledge;
  require!(w.state==REFUNDING&&!p.claimed,ErrCode::State);
  move_lamports(&w.to_account_info(),&ctx.accounts.wallet.to_account_info(),p.amount)?;
  p.claimed=true;emit!(Claimed{window:w.key(),wallet:p.wallet,tokens:0,refund:p.amount});Ok(())
 }
 pub fn set_paused(ctx:Context<Admin>,paused:bool)->Result<()>{ctx.accounts.config.paused=paused;Ok(())}
 pub fn create_coin(ctx:Context<CreateCoin>,params:CreateParams)->Result<()>{
  let now=Clock::get()?.unix_timestamp;require!(!ctx.accounts.config.paused,ErrCode::Paused);
  require!(params.start>=now&&params.start<=now+86400,ErrCode::Time);
  require!(params.end==params.start+600,ErrCode::Time);
  let first_buy=params.max_raise.checked_add(params.creator_buy).ok_or(ErrCode::Overflow)?;
  require!((MIN_FIRST_BUY..=MAX_FIRST_BUY).contains(&first_buy)&&params.min_target>=params.max_raise/10&&params.min_target<=params.max_raise,ErrCode::RaiseCap);
  require!(params.creator_tokens<=SUPPLY/20,ErrCode::Amount);
  require!((1_000_000_000..=50_000_000_000).contains(&params.bond)&&params.lock_days>=30&&params.lock_days<=180,ErrCode::Amount);
  require!((2..=32).contains(&params.name.len())&&(2..=10).contains(&params.symbol.len())&&params.symbol.bytes().all(|b|b.is_ascii_alphanumeric())&&params.uri.starts_with("https://")&&params.uri.len()<=200,ErrCode::Config);
  if params.creator_buy>0{anchor_lang::system_program::transfer(CpiContext::new(ctx.accounts.system_program.to_account_info(),anchor_lang::system_program::Transfer{from:ctx.accounts.creator.to_account_info(),to:ctx.accounts.window.to_account_info()}),params.creator_buy)?;}
  let (global_hash,platform_hash)=launchlab::configuration(&ctx.accounts.global,&ctx.accounts.platform,&ctx.accounts.config.fee_owner)?;
  let w=&mut ctx.accounts.window;w.nonce=params.nonce;w.mint_bump=ctx.bumps.mint;w.launcher_bump=ctx.bumps.launcher;w.global=ctx.accounts.global.key();w.platform=ctx.accounts.platform.key();w.fee_owner=ctx.accounts.config.fee_owner;w.global_hash=global_hash;w.platform_hash=platform_hash;w.name=params.name;w.symbol=params.symbol;w.uri=params.uri;w.wallet_age=params.wallet_age;w.history=params.history;w.creator=ctx.accounts.creator.key();w.mint=ctx.accounts.mint.key();w.start=params.start;w.end=params.end;w.min_target=params.min_target;w.max_raise=params.max_raise;w.window_tokens=0;w.creator_buy=params.creator_buy;w.creator_buy_tokens=0;w.creator_tokens=params.creator_tokens;w.vest_at=now+(params.lock_days as i64)*86400;w.created_at=now;w.bump=ctx.bumps.window;w.state=OPEN;
  let bond=&mut ctx.accounts.bond;bond.window=w.key();bond.amount=params.bond;bond.bump=ctx.bumps.bond;
  anchor_lang::system_program::transfer(CpiContext::new(ctx.accounts.system_program.to_account_info(),anchor_lang::system_program::Transfer{from:ctx.accounts.creator.to_account_info(),to:bond.to_account_info()}),params.bond)?;
  for (to,amount) in [(ctx.accounts.launcher.to_account_info(),RESERVE),(ctx.accounts.treasury.to_account_info(),CREATE_FEE)]{anchor_lang::system_program::transfer(CpiContext::new(ctx.accounts.system_program.to_account_info(),anchor_lang::system_program::Transfer{from:ctx.accounts.creator.to_account_info(),to}),amount)?;}
  emit!(WindowCreated{window:w.key(),creator:w.creator,mint:w.mint,end:w.end});Ok(())
 }
 pub fn pledge(ctx:Context<PledgeFunds>,amount:u64,cluster:[u8;32],expiry:i64)->Result<()>{
  let now=Clock::get()?.unix_timestamp;let w=&ctx.accounts.window;
  require!(!ctx.accounts.config.paused&&w.state==OPEN,ErrCode::Paused);require!(now>=w.start&&now<w.end&&expiry>now&&expiry<=now+300,ErrCode::Time);require!(amount>=10_000_000,ErrCode::Amount);
  let message=attestation_message(&crate::ID,&ctx.accounts.wallet.key(),&w.key(),&cluster,expiry);
  verify_attestation(&ctx.accounts.instructions.to_account_info(),&ctx.accounts.config.attestor,&message)?;
  let p=&mut ctx.accounts.pledge;let group=&mut ctx.accounts.cluster_cap;
  if p.wallet==Pubkey::default(){p.wallet=ctx.accounts.wallet.key();p.window=w.key();p.cluster=cluster;p.first_at=now;p.bump=ctx.bumps.pledge;}else{require!(p.cluster==cluster&&!p.claimed,ErrCode::Cluster)}
  if group.window==Pubkey::default(){group.window=w.key();group.cluster=cluster;group.bump=ctx.bumps.cluster_cap}
  let next=group.amount.checked_add(amount).ok_or(ErrCode::Overflow)?;require!(next<=w.max_raise/100,ErrCode::Cap);
  anchor_lang::system_program::transfer(CpiContext::new(ctx.accounts.system_program.to_account_info(),anchor_lang::system_program::Transfer{from:ctx.accounts.wallet.to_account_info(),to:ctx.accounts.window.to_account_info()}),amount)?;
  p.amount=p.amount.checked_add(amount).ok_or(ErrCode::Overflow)?;group.amount=next;let w=&mut ctx.accounts.window;w.pledged=w.pledged.checked_add(amount).ok_or(ErrCode::Overflow)?;
  emit!(Pledged{window:w.key(),wallet:p.wallet,amount,total:w.pledged});Ok(())
 }
 pub fn settle(ctx:Context<Settle>)->Result<()>{
  let now=Clock::get()?.unix_timestamp;let w=&mut ctx.accounts.window;require!(w.state==OPEN&&now>=w.end,ErrCode::Time);
  if w.pledged<w.min_target{w.state=REFUNDING;emit!(WindowSettled{window:w.key(),state:w.state,raised:0});return Ok(())}
  // Successful windows must use settle_launch with the canonical CPI accounts.
  err!(ErrCode::LaunchAdapterUnavailable)
 }
 pub fn abort_stalled(ctx:Context<Settle>)->Result<()>{let w=&mut ctx.accounts.window;require!(w.state==OPEN&&Clock::get()?.unix_timestamp>=w.end+3600,ErrCode::Time);w.state=REFUNDING;emit!(WindowSettled{window:w.key(),state:w.state,raised:0});Ok(())}
 pub fn claim(ctx:Context<Claim>)->Result<()>{
  let w=&ctx.accounts.window;let p=&mut ctx.accounts.pledge;require!(!p.claimed,ErrCode::Claimed);require!(w.state==LIVE||w.state==REFUNDING,ErrCode::State);
  let allocation=allocate(p.amount,w.pledged,w.raised,w.window_tokens,w.state==REFUNDING)?;
  if allocation.tokens>0{let mint=w.mint;let bump=[w.bump];let signer:&[&[u8]]=&[b"window",mint.as_ref(),&bump];token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(),Transfer{from:ctx.accounts.token_vault.to_account_info(),to:ctx.accounts.destination.to_account_info(),authority:w.to_account_info()},&[signer]),allocation.tokens)?;}
  move_lamports(&w.to_account_info(),&ctx.accounts.wallet.to_account_info(),allocation.refund)?;p.claimed=true;emit!(Claimed{window:w.key(),wallet:p.wallet,tokens:allocation.tokens,refund:allocation.refund});Ok(())
 }
 pub fn settle_launch(ctx:Context<SettleLaunch>)->Result<()>{launchlab::settle(ctx)}
 pub fn claim_reserve(ctx:Context<ClaimReserve>)->Result<()>{launchlab::reserve(ctx)}
 pub fn claim_vested(ctx:Context<ClaimNativeVested>)->Result<()>{launchlab::vested(ctx)}
 pub fn claim_creator_fees(ctx:Context<ClaimCreatorFees>)->Result<()>{launchlab::fees(ctx)}
 pub fn release_bond(ctx:Context<ReleaseBond>)->Result<()>{let w=&ctx.accounts.window;let b=&mut ctx.accounts.bond;require!(!b.released&&!b.slashed,ErrCode::Claimed);require!(w.state==REFUNDING||(w.state==LIVE&&Clock::get()?.unix_timestamp>=w.created_at+30*86400),ErrCode::Time);move_lamports(&b.to_account_info(),&ctx.accounts.creator.to_account_info(),b.amount)?;b.released=true;
  // A failed window never spent the creator's first-buy deposit: return it with the bond.
  if w.state==REFUNDING&&w.creator_buy>0{move_lamports(&w.to_account_info(),&ctx.accounts.creator.to_account_info(),w.creator_buy)?;}Ok(())}
 pub fn slash_bond(ctx:Context<SlashBond>,proof_hash:[u8;32],holder_root:[u8;32],snapshot_slot:u64)->Result<()>{let b=&mut ctx.accounts.bond;require!(!b.released&&!b.slashed&&ctx.accounts.window.state==LIVE,ErrCode::State);let clock=Clock::get()?;require!(proof_hash!=[0u8;32]&&holder_root!=[0;32]&&snapshot_slot>0&&snapshot_slot<=clock.slot,ErrCode::Proof);b.slashed=true;b.proof_hash=proof_hash;b.holder_root=holder_root;b.snapshot_slot=snapshot_slot;emit!(BondSlashed{window:ctx.accounts.window.key(),proof_hash});Ok(())}
 pub fn claim_slash(ctx:Context<ClaimCompensation>,amount:u64,proof:Vec<[u8;32]>)->Result<()>{compensation::claim(ctx,amount,proof)}
}
#[derive(Accounts)]pub struct Initialize<'info>{
 #[account(init,payer=authority,space=8+Config::INIT_SPACE,seeds=[b"config"],bump)]pub config:Account<'info,Config>,
 #[account(mut)]pub authority:Signer<'info>,
 #[account(constraint=program.programdata_address()?==Some(program_data.key()) @ ErrCode::Owner)]pub program:Program<'info,program::FloofEscrow>,
 #[account(constraint=program_data.upgrade_authority_address==Some(authority.key()) @ ErrCode::Owner)]pub program_data:Account<'info,ProgramData>,
 /// CHECK: pinned global and fee configuration checked by configuration().
 pub global:UncheckedAccount<'info>,
 /// CHECK: platform owner and all economic fields checked by configuration().
 pub platform:UncheckedAccount<'info>,pub system_program:Program<'info,System>
}
#[derive(Accounts)]pub struct Admin<'info>{#[account(mut,seeds=[b"config"],bump=config.bump,has_one=authority)]pub config:Account<'info,Config>,pub authority:Signer<'info>}
#[derive(Accounts)]#[instruction(params:CreateParams)]pub struct CreateCoin<'info>{
 #[account(seeds=[b"config"],bump=config.bump)]pub config:Account<'info,Config>,#[account(mut)]pub creator:Signer<'info>,
 /// CHECK: reserve an uninitialized PDA. LaunchLab creates the mint only at settlement.
 #[account(seeds=[b"mint",creator.key().as_ref(),&params.nonce.to_le_bytes()],bump,constraint=mint.data_is_empty() @ ErrCode::State,owner=anchor_lang::system_program::ID)]pub mint:UncheckedAccount<'info>,
 #[account(init,payer=creator,space=8+Window::INIT_SPACE,seeds=[b"window",mint.key().as_ref()],bump)]pub window:Account<'info,Window>,
 #[account(init,payer=creator,space=8+Bond::INIT_SPACE,seeds=[b"bond",window.key().as_ref()],bump)]pub bond:Account<'info,Bond>,
 #[account(mut,seeds=[b"launcher",window.key().as_ref()],bump)]pub launcher:SystemAccount<'info>,
 /// CHECK: configured global, owner and fields verified in handler.
 #[account(address=config.global)]pub global:UncheckedAccount<'info>,
 /// CHECK: configured platform, owner and fields verified in handler.
 #[account(address=config.platform)]pub platform:UncheckedAccount<'info>,
 /// CHECK: immutable fee recipient; transfer destination only.
 #[account(mut,address=config.fee_owner)]pub treasury:UncheckedAccount<'info>,pub system_program:Program<'info,System>
}
#[derive(Accounts)]#[instruction(amount:u64,cluster:[u8;32])]pub struct PledgeFunds<'info>{
 #[account(seeds=[b"config"],bump=config.bump)]pub config:Account<'info,Config>,
 #[account(mut,seeds=[b"window",window.mint.as_ref()],bump=window.bump)]pub window:Account<'info,Window>,#[account(mut)]pub wallet:Signer<'info>,
 #[account(init_if_needed,payer=wallet,space=8+Pledge::INIT_SPACE,seeds=[b"pledge",window.key().as_ref(),wallet.key().as_ref()],bump)]pub pledge:Account<'info,Pledge>,
 #[account(init_if_needed,payer=wallet,space=8+ClusterCap::INIT_SPACE,seeds=[b"cluster",window.key().as_ref(),cluster.as_ref()],bump)]pub cluster_cap:Account<'info,ClusterCap>,
 /// CHECK: canonical instructions sysvar; ed25519 instruction and offsets verified below.
 #[account(address=anchor_lang::solana_program::sysvar::instructions::ID)]pub instructions:UncheckedAccount<'info>,pub system_program:Program<'info,System>
}
#[derive(Accounts)]pub struct Settle<'info>{#[account(mut,seeds=[b"window",window.mint.as_ref()],bump=window.bump)]pub window:Account<'info,Window>}
#[derive(Accounts)]pub struct ClaimRefund<'info>{
 #[account(mut,seeds=[b"window",window.mint.as_ref()],bump=window.bump)]pub window:Account<'info,Window>,
 #[account(mut)]pub wallet:Signer<'info>,
 #[account(mut,seeds=[b"pledge",window.key().as_ref(),wallet.key().as_ref()],bump=pledge.bump,has_one=wallet,has_one=window)]pub pledge:Account<'info,Pledge>
}
#[derive(Accounts)]pub struct Claim<'info>{
 #[account(mut,seeds=[b"window",window.mint.as_ref()],bump=window.bump)]pub window:Account<'info,Window>,#[account(mut)]pub wallet:Signer<'info>,
 #[account(mut,seeds=[b"pledge",window.key().as_ref(),wallet.key().as_ref()],bump=pledge.bump,has_one=wallet,has_one=window)]pub pledge:Account<'info,Pledge>,
 #[account(mut,address=anchor_spl::associated_token::get_associated_token_address(&window.key(),&window.mint),token::authority=window,token::mint=window.mint)]pub token_vault:Account<'info,TokenAccount>,
 #[account(mut,token::authority=wallet,token::mint=window.mint)]pub destination:Account<'info,TokenAccount>,pub token_program:Program<'info,Token>
}
#[derive(Accounts)]pub struct ReleaseBond<'info>{#[account(mut,seeds=[b"window",window.mint.as_ref()],bump=window.bump,has_one=creator)]pub window:Account<'info,Window>,#[account(mut,seeds=[b"bond",window.key().as_ref()],bump=bond.bump,has_one=window)]pub bond:Account<'info,Bond>,#[account(mut)]pub creator:Signer<'info>}
#[derive(Accounts)]pub struct SlashBond<'info>{#[account(seeds=[b"config"],bump=config.bump,has_one=oracle_a,has_one=oracle_b)]pub config:Account<'info,Config>,pub oracle_a:Signer<'info>,pub oracle_b:Signer<'info>,#[account(seeds=[b"window",window.mint.as_ref()],bump=window.bump)]pub window:Account<'info,Window>,#[account(mut,seeds=[b"bond",window.key().as_ref()],bump=bond.bump,has_one=window)]pub bond:Account<'info,Bond>}
#[account]#[derive(InitSpace)]pub struct Config{pub global:Pubkey,pub platform:Pubkey,pub fee_owner:Pubkey,pub authority:Pubkey,pub attestor:Pubkey,pub oracle_a:Pubkey,pub oracle_b:Pubkey,pub paused:bool,pub bump:u8}
#[account]#[derive(InitSpace)]pub struct Window{pub creator:Pubkey,pub mint:Pubkey,pub start:i64,pub end:i64,pub created_at:i64,pub min_target:u64,pub max_raise:u64,pub window_tokens:u64,pub creator_tokens:u64,pub vest_at:i64,pub pledged:u64,pub raised:u64,pub state:u8,pub vested_claimed:bool,pub bump:u8,pub nonce:u64,pub mint_bump:u8,pub launcher_bump:u8,pub global:Pubkey,pub platform:Pubkey,pub fee_owner:Pubkey,pub global_hash:[u8;32],pub platform_hash:[u8;32],pub pool:Pubkey,pub fundraising_target:u64,#[max_len(32)]pub name:String,#[max_len(10)]pub symbol:String,#[max_len(200)]pub uri:String,pub wallet_age:bool,pub history:bool,pub creator_buy:u64,pub creator_buy_tokens:u64}
#[account]#[derive(InitSpace)]pub struct Bond{pub window:Pubkey,pub amount:u64,pub released:bool,pub slashed:bool,pub proof_hash:[u8;32],pub bump:u8,pub holder_root:[u8;32],pub snapshot_slot:u64,pub compensation_paid:u64}
#[account]#[derive(InitSpace)]pub struct Pledge{pub window:Pubkey,pub wallet:Pubkey,pub cluster:[u8;32],pub amount:u64,pub first_at:i64,pub claimed:bool,pub slash_claimed:bool,pub bump:u8}
#[account]#[derive(InitSpace)]pub struct ClusterCap{pub window:Pubkey,pub cluster:[u8;32],pub amount:u64,pub bump:u8}
#[derive(AnchorSerialize,AnchorDeserialize,Clone)]pub struct CreateParams{pub nonce:u64,pub name:String,pub symbol:String,pub uri:String,pub wallet_age:bool,pub history:bool,pub start:i64,pub end:i64,pub min_target:u64,pub max_raise:u64,pub creator_buy:u64,pub creator_tokens:u64,pub bond:u64,pub lock_days:u16}
#[derive(Debug,PartialEq)]pub struct Allocation{pub filled:u64,pub refund:u64,pub tokens:u64}
pub fn mul_div(a:u64,b:u64,d:u64)->Result<u64>{require!(d>0,ErrCode::Amount);u64::try_from((a as u128)*(b as u128)/(d as u128)).map_err(|_|error!(ErrCode::Overflow))}
pub fn mul_div_up(a:u64,b:u64,d:u64)->Result<u64>{require!(d>0,ErrCode::Amount);u64::try_from(((a as u128)*(b as u128)).div_ceil(d as u128)).map_err(|_|error!(ErrCode::Overflow))}
pub fn allocate(amount:u64,total:u64,raised:u64,tokens:u64,refund:bool)->Result<Allocation>{require!(amount<=total&&raised<=total,ErrCode::Amount);if refund{return Ok(Allocation{filled:0,refund:amount,tokens:0})}// Round the debit up: the swap already spent `raised`. Rounding each debit down
// would promise more refunds than the remaining escrow can pay. Each claimant
// pays at most one additional lamport; dust stays in escrow, never with an admin.
let filled=mul_div_up(amount,raised,total)?;Ok(Allocation{filled,refund:amount-filled,tokens:mul_div(amount,tokens,total)?})}
/// Split one measured first buy between the pledge pool and the creator buy at one average price.
/// Returns (creator_spent, creator_tokens). Pledgers receive the remainder of both.
pub fn split_first_buy(budget:u64,creator_buy:u64,spent:u64,bought:u64)->Result<(u64,u64)>{require!(budget>0&&creator_buy<=budget&&spent<=budget,ErrCode::Amount);if creator_buy==0||spent==0{return Ok((0,0))}let creator_spent=mul_div(spent,creator_buy,budget)?;Ok((creator_spent,mul_div(bought,creator_spent,spent)?))}
pub fn move_lamports(from:&AccountInfo,to:&AccountInfo,amount:u64)->Result<()>{require!(from.owner==&crate::ID,ErrCode::Owner);let remaining=from.lamports().checked_sub(amount).ok_or(ErrCode::Amount)?;require!(remaining>=Rent::get()?.minimum_balance(from.data_len()),ErrCode::Amount);**from.try_borrow_mut_lamports()?=remaining;**to.try_borrow_mut_lamports()?=to.lamports().checked_add(amount).ok_or(ErrCode::Overflow)?;Ok(())}
pub fn attestation_message(program:&Pubkey,wallet:&Pubkey,window:&Pubkey,cluster:&[u8;32],expiry:i64)->Vec<u8>{[b"floof-pledge-v1".as_slice(),program.as_ref(),wallet.as_ref(),window.as_ref(),cluster.as_ref(),&expiry.to_le_bytes()].concat()}
fn verify_attestation(sysvar:&AccountInfo,key:&Pubkey,message:&[u8])->Result<()>{let current=load_current_index_checked(sysvar)?;require!(current>0,ErrCode::Signature);let ix=load_instruction_at_checked((current-1)as usize,sysvar)?;require!(ix.program_id==pubkey!("Ed25519SigVerify111111111111111111111111111")&&ix.accounts.is_empty(),ErrCode::Signature);verify_ed25519_data(&ix.data,key,message)}
pub fn verify_ed25519_data(d:&[u8],key:&Pubkey,message:&[u8])->Result<()>{require!(d.len()>=16&&d[0]==1&&d[1]==0,ErrCode::Signature);let read=|i:usize|u16::from_le_bytes([d[i],d[i+1]])as usize;let sig=read(2);let sig_ix=read(4);let pk=read(6);let pk_ix=read(8);let msg=read(10);let size=read(12);let msg_ix=read(14);require!(sig_ix==65535&&pk_ix==65535&&msg_ix==65535&&sig>=16&&pk>=16&&msg>=16&&sig+64<=d.len()&&pk+32<=d.len()&&msg+size<=d.len()&&size==message.len(),ErrCode::Signature);require!(&d[pk..pk+32]==key.as_ref()&&&d[msg..msg+size]==message,ErrCode::Signature);Ok(())}
#[event]pub struct WindowCreated{pub window:Pubkey,pub creator:Pubkey,pub mint:Pubkey,pub end:i64}
#[event]pub struct Pledged{pub window:Pubkey,pub wallet:Pubkey,pub amount:u64,pub total:u64}
#[event]pub struct WindowSettled{pub window:Pubkey,pub state:u8,pub raised:u64}
#[event]pub struct Claimed{pub window:Pubkey,pub wallet:Pubkey,pub tokens:u64,pub refund:u64}
#[event]pub struct BondSlashed{pub window:Pubkey,pub proof_hash:[u8;32]}
#[error_code]pub enum ErrCode{#[msg("Invalid configuration")]Config,#[msg("Protocol paused")]Paused,#[msg("Invalid window or expiry time")]Time,#[msg("Invalid amount")]Amount,#[msg("Arithmetic overflow")]Overflow,#[msg("Cluster cap exceeded")]Cap,#[msg("Cluster cannot change for an existing pledge")]Cluster,#[msg("Attestation signature or message invalid")]Signature,#[msg("Already claimed")]Claimed,#[msg("Invalid state")]State,#[msg("Invalid account owner")]Owner,#[msg("Missing fraud proof")]Proof,#[msg("Successful windows require settle_launch; this refund-only instruction spent no escrow.")]LaunchAdapterUnavailable,#[msg("Raise plus creator buy must be between 0.01 SOL and the configured first-buy cap")]RaiseCap}
#[cfg(test)]mod tests{use super::*;
 #[test]fn pro_rata(){assert_eq!(allocate(3,12,10,300,false).unwrap(),Allocation{filled:3,refund:0,tokens:75});}
 #[test]fn all_refunds_fit_remaining_escrow(){for total in 2..200u64{for raised in 1..total{let refunds=(0..total).map(|_|allocate(1,total,raised,SUPPLY,false).unwrap().refund).sum::<u64>();assert!(refunds<=total-raised)}}}
 #[test]fn failed_window(){assert_eq!(allocate(500,500,0,1000000,true).unwrap(),Allocation{filled:0,refund:500,tokens:0});}
 #[test]fn large_u128_product(){assert_eq!(mul_div(2_000_000_000_000,SUPPLY,2_000_000_000_000).unwrap(),SUPPLY);}
 #[test]fn malformed_attestations(){let key=Pubkey::new_unique();for n in 0..256{assert!(verify_ed25519_data(&vec![0;n],&key,b"test").is_err())}}
 #[test]fn attestation_domain_binding(){let a=Pubkey::new_unique();let b=Pubkey::new_unique();let c=Pubkey::new_unique();assert_ne!(attestation_message(&a,&b,&c,&[0;32],123),attestation_message(&a,&c,&b,&[0;32],123));}
 #[test]fn creator_buy_shares_one_price(){let (cs,ct)=split_first_buy(42_000_000_000,2_000_000_000,42_000_000_000,420_000_000_000_000).unwrap();assert_eq!(cs,2_000_000_000);assert_eq!(ct,20_000_000_000_000);/* pledgers: 40 SOL for 400M => same 1e-4 SOL/token */let (cs,ct)=split_first_buy(10,0,10,100).unwrap();assert_eq!((cs,ct),(0,0));}
 #[test]fn partial_fill_refunds_pro_rata(){let (cs,ct)=split_first_buy(86_000_000_000,6_000_000_000,85_858_585_859,793_100_000_000_000).unwrap();assert!(cs<6_000_000_000&&ct<793_100_000_000_000);let pledge_spent=85_858_585_859-cs;assert!(pledge_spent<=80_000_000_000);}
 #[test]fn raise_cap_is_configurable_and_covers_curve(){assert!(MAX_FIRST_BUY>=launchlab::GRADUATION_QUOTE*1_000_000/990_000+1);assert!(MIN_FIRST_BUY>0);}
 #[test]fn rounding_conservation(){for n in 1..1000{let a=allocate(n,3*n+1,2*n, SUPPLY,false).unwrap();assert_eq!(a.filled+a.refund,n);assert!(a.tokens<=SUPPLY);}}
}
