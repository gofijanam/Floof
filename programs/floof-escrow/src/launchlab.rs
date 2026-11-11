//! Pinned LaunchLab ABI adapter. Devnet program only. Pool initialization and the
//! exact-out first purchase execute inside one Floof instruction and roll back together.
use super::*;
use anchor_lang::solana_program::{instruction::{Instruction,AccountMeta},program::invoke_signed};
use anchor_spl::{associated_token::{self,AssociatedToken},token::{CloseAccount}};
use solana_sha256_hasher::hash;
pub const LAUNCHLAB:Pubkey=pubkey!("DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6");
pub const WSOL:Pubkey=pubkey!("So11111111111111111111111111111111111111112");
pub const METADATA:Pubkey=pubkey!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
pub const GLOBAL:Pubkey=pubkey!("7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt");
/// Standard Raydium LaunchLab curve (SDK `createLaunchpad` defaults, pinned SDK 0.2.84-alpha):
/// 1B supply (6 dp), 793.1M sold on the curve, migrates to CPMM once 85 SOL (net of fees) is raised.
pub const SELL:u64=793_100_000_000_000;
pub const GRADUATION_QUOTE:u64=85_000_000_000;
pub const RESERVE:u64=100_000_000;
pub const CREATE_FEE:u64=20_000_000;
pub fn pda(seeds:&[&[u8]])->Pubkey{Pubkey::find_program_address(seeds,&LAUNCHLAB).0}
pub fn u64_at(d:&[u8],o:usize)->Result<u64>{Ok(u64::from_le_bytes(d.get(o..o+8).ok_or(ErrCode::Config)?.try_into().map_err(|_|ErrCode::Config)?))}
pub fn key_at(d:&[u8],o:usize)->Result<Pubkey>{Ok(Pubkey::new_from_array(d.get(o..o+32).ok_or(ErrCode::Config)?.try_into().map_err(|_|ErrCode::Config)?))}
pub fn configuration(global:&AccountInfo,platform:&AccountInfo,fee_owner:&Pubkey)->Result<([u8;32],[u8;32])>{
 require_keys_eq!(*global.owner,LAUNCHLAB,ErrCode::Owner);require_keys_eq!(*platform.owner,LAUNCHLAB,ErrCode::Owner);require_keys_eq!(global.key(),GLOBAL,ErrCode::Config);
 let g=global.try_borrow_data()?;let p=platform.try_borrow_data()?;
 require!(g.len()==371&&g[..8]==[149,8,156,202,160,252,176,217]&&g[16]==0&&g[243]==0,ErrCode::Config);
 require_keys_eq!(key_at(&g,83)?,WSOL,ErrCode::Config);require!(u64_at(&g,19)?==0&&u64_at(&g,27)?==2500,ErrCode::Config);
 require!(p.len()==944&&p[..8]==hash(b"account:PlatformConfig").to_bytes()[..8],ErrCode::Config);
 require_keys_eq!(key_at(&p,16)?,*fee_owner,ErrCode::Config);
 require!(u64_at(&p,104)?==5000&&u64_at(&p,720)?==2500&&u64_at(&p,792)?==0&&p[832]==0&&p[833]==0&&u64_at(&p,88)?==0,ErrCode::Config);
 Ok((hash(&g).to_bytes(),hash(&p).to_bytes()))
}
fn raw_cpi<'info>(program:AccountInfo<'info>,accounts:Vec<(AccountInfo<'info>,bool,bool)>,data:Vec<u8>,seeds:&[&[&[u8]]])->Result<()>{
 let metas=accounts.iter().map(|(a,w,s)|if *w{AccountMeta::new(a.key(),*s)}else{AccountMeta::new_readonly(a.key(),*s)}).collect();let mut infos:Vec<_>=accounts.into_iter().map(|a|a.0).collect();infos.push(program);
 invoke_signed(&Instruction{program_id:LAUNCHLAB,accounts:metas,data},&infos,seeds).map_err(Into::into)
}
fn string(data:&mut Vec<u8>,s:&str){data.extend_from_slice(&(s.len()as u32).to_le_bytes());data.extend_from_slice(s.as_bytes());}
pub fn initialize_data(w:&Window,target:u64)->Vec<u8>{let mut d=vec![67,153,175,39,218,16,38,32,6];string(&mut d,&w.name);string(&mut d,&w.symbol);string(&mut d,&w.uri);d.push(0);for n in [SUPPLY,SELL,target]{d.extend_from_slice(&n.to_le_bytes())}d.push(1);for n in [0u64,0,0]{d.extend_from_slice(&n.to_le_bytes())}d.push(0);d}
/// LaunchLab `buy_exact_in(amount_in, minimum_amount_out, share_fee_rate)`.
pub fn buy_data(amount_in:u64,min_out:u64)->Vec<u8>{let mut d=vec![250,234,13,123,213,156,19,236];for n in [amount_in,min_out,0]{d.extend_from_slice(&n.to_le_bytes())}d}
#[derive(Accounts)]pub struct SettleLaunch<'info>{
 #[account(mut,seeds=[b"window",window.mint.as_ref()],bump=window.bump)]pub window:Box<Account<'info,Window>>,
 /// CHECK: reserved mint PDA, initialized by the verified LaunchLab CPI only.
 #[account(mut,address=window.mint,seeds=[b"mint",window.creator.as_ref(),&window.nonce.to_le_bytes()],bump=window.mint_bump)]pub mint:UncheckedAccount<'info>,
 #[account(mut,seeds=[b"launcher",window.key().as_ref()],bump=window.launcher_bump)]pub launcher:SystemAccount<'info>,
 /// CHECK: pinned, executable external program.
 #[account(address=LAUNCHLAB,executable)]pub launchlab:UncheckedAccount<'info>,
 /// CHECK: owner/address/hash validated before CPI.
 #[account(address=window.global)]pub global:UncheckedAccount<'info>,
 /// CHECK: owner/address/hash validated before CPI.
 #[account(address=window.platform)]pub platform:UncheckedAccount<'info>,
 /// CHECK: canonical LaunchLab PDA.
 #[account(address=pda(&[b"vault_auth_seed"]))]pub authority:UncheckedAccount<'info>,
 /// CHECK: canonical pool PDA; must not be initialized before atomic settlement.
 #[account(mut,address=pda(&[b"pool",window.mint.as_ref(),WSOL.as_ref()]))]pub pool:UncheckedAccount<'info>,
 #[account(address=WSOL)]pub quote_mint:Account<'info,Mint>,
 /// CHECK: canonical LaunchLab base vault, initialized by CPI.
 #[account(mut,address=pda(&[b"pool_vault",pool.key().as_ref(),window.mint.as_ref()]))]pub base_vault:UncheckedAccount<'info>,
 /// CHECK: canonical LaunchLab quote vault, initialized by CPI.
 #[account(mut,address=pda(&[b"pool_vault",pool.key().as_ref(),WSOL.as_ref()]))]pub quote_vault:UncheckedAccount<'info>,
 /// CHECK: canonical Metaplex metadata, initialized by CPI.
 #[account(mut,address=Pubkey::find_program_address(&[b"metadata",METADATA.as_ref(),window.mint.as_ref()],&METADATA).0)]pub metadata:UncheckedAccount<'info>,
 /// CHECK: canonical buyer ATA, initialized after the mint exists.
 #[account(mut,address=associated_token::get_associated_token_address(&launcher.key(),&window.mint))]pub buyer_base:UncheckedAccount<'info>,
 /// CHECK: canonical temporary WSOL ATA, initialized with reserve, never pledge rent.
 #[account(mut,address=associated_token::get_associated_token_address(&launcher.key(),&WSOL))]pub buyer_quote:UncheckedAccount<'info>,
 /// CHECK: immutable creator; receives the creator-buy tokens and any unspent creator quote.
 #[account(mut,address=window.creator)]pub creator:UncheckedAccount<'info>,
 /// CHECK: canonical creator ATA, initialized after the mint exists.
 #[account(mut,address=associated_token::get_associated_token_address(&window.creator,&window.mint))]pub creator_base:UncheckedAccount<'info>,
 /// CHECK: canonical claim ATA, initialized after the mint exists.
 #[account(mut,address=associated_token::get_associated_token_address(&window.key(),&window.mint))]pub claim_vault:UncheckedAccount<'info>,
 /// CHECK: canonical platform fee vault.
 #[account(mut,address=pda(&[window.platform.as_ref(),WSOL.as_ref()]))]pub platform_fee_vault:UncheckedAccount<'info>,
 /// CHECK: canonical creator fee vault.
 #[account(mut,address=pda(&[launcher.key().as_ref(),WSOL.as_ref()]))]pub creator_fee_vault:UncheckedAccount<'info>,
 /// CHECK: canonical external CPI event authority.
 #[account(address=pda(&[b"__event_authority"]))]pub event_authority:UncheckedAccount<'info>,
 /// CHECK: fixed Metaplex program.
 #[account(address=METADATA,executable)]pub metadata_program:UncheckedAccount<'info>,
 pub token_program:Program<'info,Token>,pub associated_token_program:Program<'info,AssociatedToken>,pub system_program:Program<'info,System>,pub rent:Sysvar<'info,Rent>
}
fn token_amount(a:&AccountInfo)->Result<u64>{require_keys_eq!(*a.owner,token::ID,ErrCode::Owner);u64_at(&a.try_borrow_data()?,64)}
fn ata<'info>(payer:AccountInfo<'info>,account:AccountInfo<'info>,authority:AccountInfo<'info>,mint:AccountInfo<'info>,token:AccountInfo<'info>,system:AccountInfo<'info>,associated:AccountInfo<'info>,seeds:&[&[&[u8]]])->Result<()>{associated_token::create_idempotent(CpiContext::new_with_signer(associated,associated_token::Create{payer,associated_token:account,authority,mint,system_program:system,token_program:token},seeds))}
pub fn settle(ctx:Context<SettleLaunch>)->Result<()>{
 let a=&ctx.accounts;let now=Clock::get()?.unix_timestamp;require!(a.window.state==OPEN&&now>=a.window.end&&a.window.pledged>=a.window.min_target,ErrCode::Time);
 require!(a.pool.data_is_empty()&&a.mint.data_is_empty(),ErrCode::State);
 // First buy = filled presale + creator buy, on the unchanged standard curve.
 let pledge_budget=a.window.pledged.min(a.window.max_raise);let creator_buy=a.window.creator_buy;
 let budget=pledge_budget.checked_add(creator_buy).ok_or(ErrCode::Overflow)?;require!(budget>=MIN_FIRST_BUY&&budget<=MAX_FIRST_BUY,ErrCode::RaiseCap);
 let (g,p)=configuration(&a.global,&a.platform,&a.window.fee_owner)?;require!(g==a.window.global_hash&&p==a.window.platform_hash,ErrCode::Config);
 let wk=a.window.key();let lb=[a.window.launcher_bump];let launcher_seeds:&[&[u8]]=&[b"launcher",wk.as_ref(),&lb];let mb=[a.window.mint_bump];let nonce=a.window.nonce.to_le_bytes();let mint_seeds:&[&[u8]]=&[b"mint",a.window.creator.as_ref(),&nonce,&mb];let signers=&[launcher_seeds,mint_seeds];
 raw_cpi(a.launchlab.to_account_info(),vec![
 (a.launcher.to_account_info(),true,true),(a.launcher.to_account_info(),false,false),(a.global.to_account_info(),false,false),(a.platform.to_account_info(),false,false),(a.authority.to_account_info(),false,false),(a.pool.to_account_info(),true,false),(a.mint.to_account_info(),true,true),(a.quote_mint.to_account_info(),false,false),(a.base_vault.to_account_info(),true,false),(a.quote_vault.to_account_info(),true,false),(a.metadata.to_account_info(),true,false),(a.token_program.to_account_info(),false,false),(a.token_program.to_account_info(),false,false),(a.metadata_program.to_account_info(),false,false),(a.system_program.to_account_info(),false,false),(a.rent.to_account_info(),false,false),(a.event_authority.to_account_info(),false,false),(a.launchlab.to_account_info(),false,false)
 ],initialize_data(&a.window,GRADUATION_QUOTE),signers)?;
 for (account,owner,mint) in [(a.buyer_base.to_account_info(),a.launcher.to_account_info(),a.mint.to_account_info()),(a.buyer_quote.to_account_info(),a.launcher.to_account_info(),a.quote_mint.to_account_info()),(a.claim_vault.to_account_info(),a.window.to_account_info(),a.mint.to_account_info())]{ata(a.launcher.to_account_info(),account,owner,mint,a.token_program.to_account_info(),a.system_program.to_account_info(),a.associated_token_program.to_account_info(),&[launcher_seeds])?;}
 if creator_buy>0{ata(a.launcher.to_account_info(),a.creator_base.to_account_info(),a.creator.to_account_info(),a.mint.to_account_info(),a.token_program.to_account_info(),a.system_program.to_account_info(),a.associated_token_program.to_account_info(),&[launcher_seeds])?;}
 let before_base=token_amount(&a.buyer_base)?;let before_quote=token_amount(&a.buyer_quote)?;
 // Move principal through the system-owned launcher, then wrap it. Include the
 // source window in the CPI so both direct balance deltas synchronize together.
 move_lamports(&a.window.to_account_info(),&a.launcher.to_account_info(),budget)?;
 let transfer_data=[2u32.to_le_bytes().as_slice(),budget.to_le_bytes().as_slice()].concat();
 let transfer_ix=Instruction{program_id:anchor_lang::system_program::ID,accounts:vec![AccountMeta::new(a.launcher.key(),true),AccountMeta::new(a.buyer_quote.key(),false),AccountMeta::new(a.window.key(),false)],data:transfer_data};
 invoke_signed(&transfer_ix,&[a.launcher.to_account_info(),a.buyer_quote.to_account_info(),a.window.to_account_info(),a.system_program.to_account_info()],&[launcher_seeds])?;
 token::sync_native(CpiContext::new(a.token_program.to_account_info(),token::SyncNative{account:a.buyer_quote.to_account_info()}))?;
 raw_cpi(a.launchlab.to_account_info(),vec![
 (a.launcher.to_account_info(),true,true),(a.authority.to_account_info(),false,false),(a.global.to_account_info(),false,false),(a.platform.to_account_info(),false,false),(a.pool.to_account_info(),true,false),(a.buyer_base.to_account_info(),true,false),(a.buyer_quote.to_account_info(),true,false),(a.base_vault.to_account_info(),true,false),(a.quote_vault.to_account_info(),true,false),(a.mint.to_account_info(),false,false),(a.quote_mint.to_account_info(),false,false),(a.token_program.to_account_info(),false,false),(a.token_program.to_account_info(),false,false),(a.event_authority.to_account_info(),false,false),(a.launchlab.to_account_info(),false,false),(a.system_program.to_account_info(),false,false),(a.platform_fee_vault.to_account_info(),true,false),(a.creator_fee_vault.to_account_info(),true,false)
 ],buy_data(budget,1),&[launcher_seeds])?;
 let bought=token_amount(&a.buyer_base)?.checked_sub(before_base).ok_or(ErrCode::Amount)?;let spent=before_quote.checked_add(budget).ok_or(ErrCode::Overflow)?.checked_sub(token_amount(&a.buyer_quote)?).ok_or(ErrCode::Amount)?;
 let pool=a.pool.try_borrow_data()?;require!(pool.len()==429&&pool[..8]==[247,237,227,245,215,195,222,70],ErrCode::State);let status=pool[17];require_keys_eq!(key_at(&pool,205)?,a.window.mint,ErrCode::Config);require_keys_eq!(key_at(&pool,333)?,a.launcher.key(),ErrCode::Config);require!(u64_at(&pool,53)?==bought&&u64_at(&pool,69)?==GRADUATION_QUOTE,ErrCode::Amount);drop(pool);
 // On a trading curve exact-in spends the whole budget. Only a first buy that completes the
 // curve (status != 0, migration pending) may leave quote unspent; that quote is refunded below.
 require!(bought>0&&spent<=budget&&(spent==budget||status!=0),ErrCode::Amount);
 let (creator_spent,creator_tokens)=split_first_buy(budget,creator_buy,spent,bought)?;let window_tokens=bought-creator_tokens;let pledge_spent=spent-creator_spent;
 // Unlocked dev buys go straight to the creator; locked ones wait in the window vault (claim_dev_buy).
 let dev_locked=a.window.vest_at>a.window.created_at;
 if creator_tokens>0{token::transfer(CpiContext::new_with_signer(a.token_program.to_account_info(),Transfer{from:a.buyer_base.to_account_info(),to:if dev_locked{a.claim_vault.to_account_info()}else{a.creator_base.to_account_info()},authority:a.launcher.to_account_info()},&[launcher_seeds]),creator_tokens)?;}
 if window_tokens>0{token::transfer(CpiContext::new_with_signer(a.token_program.to_account_info(),Transfer{from:a.buyer_base.to_account_info(),to:a.claim_vault.to_account_info(),authority:a.launcher.to_account_info()},&[launcher_seeds]),window_tokens)?;}
 token::close_account(CpiContext::new_with_signer(a.token_program.to_account_info(),CloseAccount{account:a.buyer_quote.to_account_info(),destination:a.launcher.to_account_info(),authority:a.launcher.to_account_info()},&[launcher_seeds]))?;
 if budget>spent{anchor_lang::system_program::transfer(CpiContext::new_with_signer(a.system_program.to_account_info(),anchor_lang::system_program::Transfer{from:a.launcher.to_account_info(),to:a.window.to_account_info()},&[launcher_seeds]),budget-spent)?;}
 let creator_refund=creator_buy-creator_spent;if creator_refund>0{move_lamports(&a.window.to_account_info(),&a.creator.to_account_info(),creator_refund)?;}
 let w=&mut ctx.accounts.window;w.raised=pledge_spent;w.window_tokens=window_tokens;w.creator_buy_tokens=creator_tokens;w.dev_claimed=!dev_locked||creator_tokens==0;w.state=LIVE;w.pool=ctx.accounts.pool.key();w.fundraising_target=GRADUATION_QUOTE;emit!(WindowSettled{window:w.key(),state:w.state,raised:pledge_spent});emit!(FirstBuy{window:w.key(),spent,bought,creator_spent,creator_tokens,migration_pending:status!=0});Ok(())
}
#[event]pub struct FirstBuy{pub window:Pubkey,pub spent:u64,pub bought:u64,pub creator_spent:u64,pub creator_tokens:u64,pub migration_pending:bool}
#[derive(Accounts)]pub struct ClaimReserve<'info>{
 #[account(seeds=[b"window",window.mint.as_ref()],bump=window.bump,has_one=creator)]pub window:Account<'info,Window>,#[account(mut)]pub creator:Signer<'info>,
 #[account(mut,seeds=[b"launcher",window.key().as_ref()],bump=window.launcher_bump)]pub launcher:SystemAccount<'info>,pub system_program:Program<'info,System>
}
pub fn reserve(ctx:Context<ClaimReserve>)->Result<()>{let w=&ctx.accounts.window;require!(w.state!=OPEN,ErrCode::State);let wk=w.key();let bump=[w.launcher_bump];let signer:&[&[u8]]=&[b"launcher",wk.as_ref(),&bump];anchor_lang::system_program::transfer(CpiContext::new_with_signer(ctx.accounts.system_program.to_account_info(),anchor_lang::system_program::Transfer{from:ctx.accounts.launcher.to_account_info(),to:ctx.accounts.creator.to_account_info()},&[signer]),ctx.accounts.launcher.lamports())}
#[derive(Accounts)]pub struct ClaimCreatorFees<'info>{
 #[account(seeds=[b"window",window.mint.as_ref()],bump=window.bump,has_one=creator)]pub window:Account<'info,Window>,#[account(mut)]pub creator:Signer<'info>,
 #[account(mut,seeds=[b"launcher",window.key().as_ref()],bump=window.launcher_bump)]pub launcher:SystemAccount<'info>,
 /// CHECK: fixed executable program.
 #[account(address=LAUNCHLAB,executable)]pub launchlab:UncheckedAccount<'info>,
 /// CHECK: canonical creator fee authority.
 #[account(address=pda(&[b"creator_fee_vault_auth_seed"]))]pub fee_authority:UncheckedAccount<'info>,
 /// CHECK: canonical per-launch fee vault.
 #[account(mut,address=pda(&[launcher.key().as_ref(),WSOL.as_ref()]))]pub fee_vault:UncheckedAccount<'info>,
 #[account(address=WSOL)]pub quote_mint:Account<'info,Mint>,
 #[account(init_if_needed,payer=creator,associated_token::mint=quote_mint,associated_token::authority=launcher)]pub quote_ata:Account<'info,TokenAccount>,
 pub token_program:Program<'info,Token>,pub associated_token_program:Program<'info,AssociatedToken>,pub system_program:Program<'info,System>
}
pub fn fees(ctx:Context<ClaimCreatorFees>)->Result<()>{let a=&ctx.accounts;require!(a.window.state==LIVE,ErrCode::State);let wk=a.window.key();let bump=[a.window.launcher_bump];let signer:&[&[u8]]=&[b"launcher",wk.as_ref(),&bump];let before=a.quote_ata.amount;
 raw_cpi(a.launchlab.to_account_info(),vec![(a.launcher.to_account_info(),true,true),(a.fee_authority.to_account_info(),false,false),(a.fee_vault.to_account_info(),true,false),(a.quote_ata.to_account_info(),true,false),(a.quote_mint.to_account_info(),false,false),(a.token_program.to_account_info(),false,false),(a.system_program.to_account_info(),false,false),(a.associated_token_program.to_account_info(),false,false)],vec![26,97,138,203,132,171,141,252],&[signer])?;
 let amount=token_amount(&a.quote_ata.to_account_info())?.checked_sub(before).ok_or(ErrCode::Amount)?;
 token::close_account(CpiContext::new_with_signer(a.token_program.to_account_info(),CloseAccount{account:a.quote_ata.to_account_info(),destination:a.creator.to_account_info(),authority:a.launcher.to_account_info()},&[signer]))?;emit!(CreatorFeesClaimed{window:wk,creator:a.creator.key(),amount});Ok(())}
#[event]pub struct CreatorFeesClaimed{pub window:Pubkey,pub creator:Pubkey,pub amount:u64}
