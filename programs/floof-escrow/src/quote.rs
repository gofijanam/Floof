//! Token-quoted fair windows (SPL Token and Token-2022 quote mints).
//! SOL windows keep the original native-lamport path (lib.rs / launchlab.rs) byte-for-byte; a window
//! is token-quoted when its LaunchLab GlobalConfig is not the pinned SOL config. Pledges, refunds,
//! creator-buy deposits and the first buy are all held in an escrow token account owned by the
//! window's launcher PDA (the same signer that buys on LaunchLab), so the buy spends straight from
//! escrow with no extra hop. Every inbound transfer is credited by the measured balance delta so a
//! Token-2022 transfer fee can never leave the escrow under-funded.
use super::*;
use anchor_lang::solana_program::{instruction::{Instruction,AccountMeta},program::invoke_signed,program_pack::Pack};
use anchor_spl::associated_token::{self,AssociatedToken,get_associated_token_address_with_program_id as ata_with};
use anchor_spl::token_interface::{self,Mint as QMint,TokenAccount as QAccount,TokenInterface,TransferChecked};
use anchor_spl::token_2022::spl_token_2022::{self,extension::{BaseStateWithExtensions,StateWithExtensions,ExtensionType,transfer_hook::TransferHook,default_account_state::DefaultAccountState,pausable::PausableConfig},state::{Mint as MintState,AccountState}};
use solana_sha256_hasher::hash;

/// Per-quote settings, written only by the Floof config authority.
#[account]#[derive(InitSpace)]pub struct QuoteConfig{pub mint:Pubkey,pub token_program:Pubkey,pub global:Pubkey,pub decimals:u8,pub enabled:bool,
 /// Admin acknowledged issuer controls (permanent delegate, pausable, hook authority, confidential transfers): the issuer can freeze or move escrowed funds.
 pub issuer_controls:bool,
 /// Raw quote units. Pledges below min_pledge are rejected; raise + creator buy must be at least min_first_buy.
 pub min_pledge:u64,pub min_first_buy:u64,
 /// Sanity band for the attested migration target (raw quote units, "USD value of 85 SOL" at creation).
 pub target_min:u64,pub target_max:u64,pub bump:u8}
#[derive(AnchorSerialize,AnchorDeserialize,Clone)]pub struct QuoteParams{pub enabled:bool,pub issuer_controls:bool,pub min_pledge:u64,pub min_first_buy:u64,pub target_min:u64,pub target_max:u64}

pub fn is_sol(w:&Window)->bool{w.global==GLOBAL}
/// Gross first-buy cap for a migration target: the same 86/85 headroom as the SOL path (86 SOL for 85 SOL).
pub fn max_first_buy(target:u64)->Result<u64>{mul_div_up(target,MAX_FIRST_BUY,GRADUATION_QUOTE)}
pub fn quote_message(program:&Pubkey,quote_mint:&Pubkey,target:u64,expiry:i64)->Vec<u8>{[b"floof-quote-v1".as_slice(),program.as_ref(),quote_mint.as_ref(),&target.to_le_bytes(),&expiry.to_le_bytes()].concat()}

/// Mint-extension policy. Returns Err for extensions that could trap or silently drain escrow.
/// Hard rejects: non-transferable, frozen-by-default accounts, an active transfer hook program,
/// mint close authority, and any extension this program does not know. Issuer controls are allowed
/// only when the admin set issuer_controls (e.g. regulated xStocks: permanent delegate + pausable).
pub fn check_mint_policy(mint:&AccountInfo,token_program:&Pubkey,decimals:u8,issuer_controls:bool)->Result<()>{
 require_keys_eq!(*mint.owner,*token_program,ErrCode::Owner);
 let data=mint.try_borrow_data()?;
 if *token_program==token::ID{let m=anchor_spl::token::spl_token::state::Mint::unpack(&data).map_err(|_|ErrCode::Config)?;require!(m.is_initialized&&m.decimals==decimals,ErrCode::Config);return Ok(())}
 require_keys_eq!(*token_program,spl_token_2022::ID,ErrCode::Owner);
 let m=StateWithExtensions::<MintState>::unpack(&data).map_err(|_|ErrCode::Config)?;require!(m.base.is_initialized&&m.base.decimals==decimals,ErrCode::Config);
 for ext in m.get_extension_types().map_err(|_|ErrCode::Config)?{match ext{
  ExtensionType::TransferFeeConfig|ExtensionType::InterestBearingConfig|ExtensionType::MetadataPointer|ExtensionType::TokenMetadata|ExtensionType::GroupPointer|ExtensionType::TokenGroup|ExtensionType::GroupMemberPointer|ExtensionType::TokenGroupMember|ExtensionType::ScaledUiAmount|ExtensionType::ConfidentialTransferFeeConfig=>{}
  ExtensionType::DefaultAccountState=>{let s=m.get_extension::<DefaultAccountState>().map_err(|_|ErrCode::Config)?;require!(s.state==AccountState::Initialized as u8,ErrCode::QuoteMint)}
  ExtensionType::TransferHook=>{let h=m.get_extension::<TransferHook>().map_err(|_|ErrCode::Config)?;require!(Option::<Pubkey>::from(h.program_id).is_none()&&(issuer_controls||Option::<Pubkey>::from(h.authority).is_none()),ErrCode::QuoteMint)}
  ExtensionType::Pausable=>{let p=m.get_extension::<PausableConfig>().map_err(|_|ErrCode::Config)?;require!(issuer_controls&&!bool::from(p.paused),ErrCode::QuoteMint)}
  ExtensionType::PermanentDelegate|ExtensionType::ConfidentialTransferMint|ExtensionType::ConfidentialMintBurn=>{require!(issuer_controls,ErrCode::QuoteMint)}
  _=>return err!(ErrCode::QuoteMint)}}
 Ok(())
}
/// Same pinned economics as the SOL GlobalConfig (constant curve, 0.25% trade fee, no migrate fee),
/// but for the quote mint registered in QuoteConfig.
pub fn quote_configuration(global:&AccountInfo,platform:&AccountInfo,fee_owner:&Pubkey,quote_mint:&Pubkey)->Result<([u8;32],[u8;32],u64)>{
 require_keys_eq!(*global.owner,LAUNCHLAB,ErrCode::Owner);require_keys_eq!(*platform.owner,LAUNCHLAB,ErrCode::Owner);require_keys_neq!(global.key(),GLOBAL,ErrCode::Config);
 let g=global.try_borrow_data()?;let p=platform.try_borrow_data()?;
 require!(g.len()==371&&g[..8]==[149,8,156,202,160,252,176,217]&&g[16]==0&&g[243]==0,ErrCode::Config);
 require_keys_eq!(key_at(&g,83)?,*quote_mint,ErrCode::Config);require!(u64_at(&g,19)?==0&&u64_at(&g,27)?==2500,ErrCode::Config);
 require!(p.len()==944&&p[..8]==hash(b"account:PlatformConfig").to_bytes()[..8],ErrCode::Config);
 require_keys_eq!(key_at(&p,16)?,*fee_owner,ErrCode::Config);
 require!(u64_at(&p,104)?==5000&&u64_at(&p,720)?==2500&&u64_at(&p,792)?==0&&p[832]==0&&p[833]==0&&u64_at(&p,88)?==0,ErrCode::Config);
 Ok((hash(&g).to_bytes(),hash(&p).to_bytes(),u64_at(&g,75)?))
}
pub fn qamount(a:&AccountInfo)->Result<u64>{require!(*a.owner==token::ID||*a.owner==spl_token_2022::ID,ErrCode::Owner);u64_at(&a.try_borrow_data()?,64)}
fn xfer<'info>(program:&AccountInfo<'info>,from:AccountInfo<'info>,mint:&InterfaceAccount<'info,QMint>,to:AccountInfo<'info>,authority:AccountInfo<'info>,amount:u64,seeds:&[&[&[u8]]])->Result<()>{
 if amount==0{return Ok(())}token_interface::transfer_checked(CpiContext::new_with_signer(program.clone(),TransferChecked{from,mint:mint.to_account_info(),to,authority},seeds),amount,mint.decimals)
}
/// Transfer into escrow and return what actually arrived (Token-2022 transfer fees are withheld at the destination).
fn deposit<'info>(program:&AccountInfo<'info>,from:AccountInfo<'info>,mint:&InterfaceAccount<'info,QMint>,escrow:&AccountInfo<'info>,authority:AccountInfo<'info>,amount:u64)->Result<u64>{
 let before=qamount(escrow)?;xfer(program,from,mint,escrow.clone(),authority,amount,&[])?;let got=qamount(escrow)?.checked_sub(before).ok_or(ErrCode::Amount)?;require!(got>0,ErrCode::Amount);Ok(got)
}
macro_rules! launcher_seeds{($w:expr,$wk:ident,$b:ident)=>{let $wk=$w.key();let $b=[$w.launcher_bump];}}

pub fn q_set_quote(ctx:Context<SetQuote>,q:QuoteParams)->Result<()>{
 let a=&ctx.accounts;let mint=a.quote_mint.key();require_keys_neq!(mint,WSOL,ErrCode::Config);
 require!(q.min_pledge>0&&q.min_first_buy>=q.min_pledge&&q.target_min>0&&q.target_min<=q.target_max&&q.min_first_buy<=max_first_buy(q.target_min)?,ErrCode::Config);
 check_mint_policy(&a.quote_mint.to_account_info(),&a.token_program.key(),a.quote_mint.decimals,q.issuer_controls)?;
 let (_,_,min_raise)=quote_configuration(&a.global,&a.platform,&a.config.fee_owner,&mint)?;require!(q.target_min>=min_raise,ErrCode::Config);
 let c=&mut ctx.accounts.quote_config;c.mint=mint;c.token_program=ctx.accounts.token_program.key();c.global=ctx.accounts.global.key();c.decimals=ctx.accounts.quote_mint.decimals;c.enabled=q.enabled;c.issuer_controls=q.issuer_controls;c.min_pledge=q.min_pledge;c.min_first_buy=q.min_first_buy;c.target_min=q.target_min;c.target_max=q.target_max;c.bump=ctx.bumps.quote_config;
 emit!(QuoteSet{mint,global:c.global,enabled:c.enabled});Ok(())
}
pub fn q_create(ctx:Context<CreateCoinQuote>,params:CreateParams,target:u64,expiry:i64)->Result<()>{
 let now=Clock::get()?.unix_timestamp;let a=&ctx.accounts;let qc=&a.quote_config;require!(!a.config.paused&&qc.enabled,ErrCode::Paused);
 require!((MIN_WINDOW_SECS..=MAX_WINDOW_SECS).contains(&params.duration),ErrCode::Time);
 // Migration target = USD value of 85 SOL in this quote, priced off-chain and attested by the Floof attestor; fixed for the window's life.
 require!(expiry>now&&expiry<=now+300,ErrCode::Time);require!(target>=qc.target_min&&target<=qc.target_max,ErrCode::Target);
 verify_attestation(&a.instructions.to_account_info(),&a.config.attestor,&quote_message(&crate::ID,&qc.mint,target,expiry))?;
 let first_buy=params.max_raise.checked_add(params.creator_buy).ok_or(ErrCode::Overflow)?;
 require!(first_buy>=qc.min_first_buy&&first_buy<=max_first_buy(target)?&&params.min_target>=params.max_raise/10&&params.min_target<=params.max_raise&&params.max_raise/100>=qc.min_pledge,ErrCode::RaiseCap);
 require!(params.lock_days<=MAX_LOCK_DAYS,ErrCode::Amount);
 require!((2..=32).contains(&params.name.len())&&(2..=10).contains(&params.symbol.len())&&params.symbol.bytes().all(|b|b.is_ascii_alphanumeric())&&params.uri.starts_with("https://")&&params.uri.len()<=200,ErrCode::Config);
 check_mint_policy(&a.quote_mint.to_account_info(),&qc.token_program,qc.decimals,qc.issuer_controls)?;
 let (global_hash,platform_hash,min_raise)=quote_configuration(&a.global,&a.platform,&a.config.fee_owner,&qc.mint)?;require!(target>=min_raise,ErrCode::Target);
 associated_token::create(CpiContext::new(a.associated_token_program.to_account_info(),associated_token::Create{payer:a.creator.to_account_info(),associated_token:a.escrow.to_account_info(),authority:a.launcher.to_account_info(),mint:a.quote_mint.to_account_info(),system_program:a.system_program.to_account_info(),token_program:a.token_program.to_account_info()}))?;
 let creator_buy=if params.creator_buy>0{deposit(&a.token_program.to_account_info(),a.creator_quote.to_account_info(),&a.quote_mint,&a.escrow.to_account_info(),a.creator.to_account_info(),params.creator_buy)?}else{0};
 for (to,amount) in [(a.launcher.to_account_info(),RESERVE),(a.treasury.to_account_info(),CREATE_FEE)]{anchor_lang::system_program::transfer(CpiContext::new(a.system_program.to_account_info(),anchor_lang::system_program::Transfer{from:a.creator.to_account_info(),to}),amount)?;}
 let global=a.global.key();let platform=a.platform.key();let fee_owner=a.config.fee_owner;let creator=a.creator.key();let mint=a.mint.key();
 let w=&mut ctx.accounts.window;w.nonce=params.nonce;w.mint_bump=ctx.bumps.mint;w.launcher_bump=ctx.bumps.launcher;w.global=global;w.platform=platform;w.fee_owner=fee_owner;w.global_hash=global_hash;w.platform_hash=platform_hash;w.name=params.name;w.symbol=params.symbol;w.uri=params.uri;w.wallet_age=params.wallet_age;w.history=params.history;w.creator=creator;w.mint=mint;w.start=now;w.end=now+params.duration;w.min_target=params.min_target;w.max_raise=params.max_raise;w.window_tokens=0;w.creator_buy=creator_buy;w.creator_buy_tokens=0;w.dev_claimed=false;w.creator_refunded=false;w.creator_tokens=0;w.vested_claimed=true;w.vest_at=now+(params.lock_days as i64)*86400;w.created_at=now;w.bump=ctx.bumps.window;w.state=OPEN;w.fundraising_target=target;
 emit!(WindowCreated{window:w.key(),creator:w.creator,mint:w.mint,end:w.end});emit!(QuoteWindowCreated{window:w.key(),quote_mint:ctx.accounts.quote_config.mint,target,creator_buy});Ok(())
}
pub fn q_pledge(ctx:Context<PledgeQuote>,amount:u64,cluster:[u8;32],expiry:i64)->Result<()>{
 let now=Clock::get()?.unix_timestamp;let w=&ctx.accounts.window;
 require!(!ctx.accounts.config.paused&&w.state==OPEN,ErrCode::Paused);require!(now>=w.start&&now<w.end&&expiry>now&&expiry<=now+300,ErrCode::Time);require!(amount>=ctx.accounts.quote_config.min_pledge,ErrCode::Amount);
 verify_attestation(&ctx.accounts.instructions.to_account_info(),&ctx.accounts.config.attestor,&attestation_message(&crate::ID,&ctx.accounts.wallet.key(),&w.key(),&cluster,expiry))?;
 let credited=deposit(&ctx.accounts.token_program.to_account_info(),ctx.accounts.wallet_quote.to_account_info(),&ctx.accounts.quote_mint,&ctx.accounts.escrow.to_account_info(),ctx.accounts.wallet.to_account_info(),amount)?;
 let wk=w.key();let max=w.max_raise;let p=&mut ctx.accounts.pledge;let group=&mut ctx.accounts.cluster_cap;
 if p.wallet==Pubkey::default(){p.wallet=ctx.accounts.wallet.key();p.window=wk;p.cluster=cluster;p.first_at=now;p.bump=ctx.bumps.pledge;}else{require!(p.cluster==cluster&&!p.claimed,ErrCode::Cluster)}
 if group.window==Pubkey::default(){group.window=wk;group.cluster=cluster;group.bump=ctx.bumps.cluster_cap}
 let next=group.amount.checked_add(credited).ok_or(ErrCode::Overflow)?;require!(next<=max/100,ErrCode::Cap);
 p.amount=p.amount.checked_add(credited).ok_or(ErrCode::Overflow)?;group.amount=next;let w=&mut ctx.accounts.window;w.pledged=w.pledged.checked_add(credited).ok_or(ErrCode::Overflow)?;
 emit!(Pledged{window:w.key(),wallet:p.wallet,amount:credited,total:w.pledged});Ok(())
}
pub fn q_claim_refund(ctx:Context<QuoteRefund>)->Result<()>{
 let a=&ctx.accounts;let w=&a.window;require!(w.state==REFUNDING&&!a.pledge.claimed,ErrCode::State);launcher_seeds!(w,wk,b);let s:&[&[u8]]=&[b"launcher",wk.as_ref(),&b];
 let amount=a.pledge.amount;xfer(&a.token_program.to_account_info(),a.escrow.to_account_info(),&a.quote_mint,a.wallet_quote.to_account_info(),a.launcher.to_account_info(),amount,&[s])?;
 let p=&mut ctx.accounts.pledge;p.claimed=true;emit!(Claimed{window:wk,wallet:p.wallet,tokens:0,refund:amount});Ok(())
}
pub fn q_claim(ctx:Context<QuoteClaim>)->Result<()>{
 let a=&ctx.accounts;let w=&a.window;require!(!a.pledge.claimed,ErrCode::Claimed);require!(w.state==LIVE||w.state==REFUNDING,ErrCode::State);
 let allocation=allocate(a.pledge.amount,w.pledged,w.raised,w.window_tokens,w.state==REFUNDING)?;
 if allocation.tokens>0{let mint=w.mint;let bump=[w.bump];let signer:&[&[u8]]=&[b"window",mint.as_ref(),&bump];token::transfer(CpiContext::new_with_signer(a.token_program.to_account_info(),Transfer{from:a.token_vault.to_account_info(),to:a.destination.to_account_info(),authority:w.to_account_info()},&[signer]),allocation.tokens)?;}
 launcher_seeds!(w,wk,b);let s:&[&[u8]]=&[b"launcher",wk.as_ref(),&b];
 xfer(&a.quote_token_program.to_account_info(),a.escrow.to_account_info(),&a.quote_mint,a.wallet_quote.to_account_info(),a.launcher.to_account_info(),allocation.refund,&[s])?;
 let p=&mut ctx.accounts.pledge;p.claimed=true;emit!(Claimed{window:wk,wallet:p.wallet,tokens:allocation.tokens,refund:allocation.refund});Ok(())
}
pub fn q_refund_creator_buy(ctx:Context<QuoteCreatorRefund>)->Result<()>{
 let a=&ctx.accounts;let w=&a.window;require!(w.state==REFUNDING&&w.creator_buy>0&&!w.creator_refunded,ErrCode::State);launcher_seeds!(w,wk,b);let s:&[&[u8]]=&[b"launcher",wk.as_ref(),&b];
 xfer(&a.token_program.to_account_info(),a.escrow.to_account_info(),&a.quote_mint,a.creator_quote.to_account_info(),a.launcher.to_account_info(),w.creator_buy,&[s])?;ctx.accounts.window.creator_refunded=true;Ok(())
}
fn raw_cpi<'info>(program:AccountInfo<'info>,accounts:Vec<(AccountInfo<'info>,bool,bool)>,data:Vec<u8>,seeds:&[&[&[u8]]])->Result<()>{
 let metas=accounts.iter().map(|(a,w,s)|if *w{AccountMeta::new(a.key(),*s)}else{AccountMeta::new_readonly(a.key(),*s)}).collect();let mut infos:Vec<_>=accounts.into_iter().map(|a|a.0).collect();infos.push(program);
 invoke_signed(&Instruction{program_id:LAUNCHLAB,accounts:metas,data},&infos,seeds).map_err(Into::into)
}
fn base_amount(a:&AccountInfo)->Result<u64>{require_keys_eq!(*a.owner,token::ID,ErrCode::Owner);u64_at(&a.try_borrow_data()?,64)}
pub fn q_settle(ctx:Context<SettleQuote>)->Result<()>{
 let a=&ctx.accounts;let now=Clock::get()?.unix_timestamp;require!(a.window.state==OPEN&&now>=a.window.end&&a.window.pledged>=a.window.min_target,ErrCode::Time);
 require!(a.pool.data_is_empty()&&a.mint.data_is_empty(),ErrCode::State);
 let target=a.window.fundraising_target;let pledge_budget=a.window.pledged.min(a.window.max_raise);let creator_buy=a.window.creator_buy;
 let budget=pledge_budget.checked_add(creator_buy).ok_or(ErrCode::Overflow)?;require!(budget>=a.quote_config.min_first_buy&&budget<=max_first_buy(target)?,ErrCode::RaiseCap);
 let (g,p,_)=quote_configuration(&a.global,&a.platform,&a.window.fee_owner,&a.quote_config.mint)?;require!(g==a.window.global_hash&&p==a.window.platform_hash,ErrCode::Config);
 let wk=a.window.key();let lb=[a.window.launcher_bump];let launcher_seeds:&[&[u8]]=&[b"launcher",wk.as_ref(),&lb];let mb=[a.window.mint_bump];let nonce=a.window.nonce.to_le_bytes();let mint_seeds:&[&[u8]]=&[b"mint",a.window.creator.as_ref(),&nonce,&mb];
 raw_cpi(a.launchlab.to_account_info(),vec![
 (a.launcher.to_account_info(),true,true),(a.launcher.to_account_info(),false,false),(a.global.to_account_info(),false,false),(a.platform.to_account_info(),false,false),(a.authority.to_account_info(),false,false),(a.pool.to_account_info(),true,false),(a.mint.to_account_info(),true,true),(a.quote_mint.to_account_info(),false,false),(a.base_vault.to_account_info(),true,false),(a.quote_vault.to_account_info(),true,false),(a.metadata.to_account_info(),true,false),(a.token_program.to_account_info(),false,false),(a.quote_token_program.to_account_info(),false,false),(a.metadata_program.to_account_info(),false,false),(a.system_program.to_account_info(),false,false),(a.rent.to_account_info(),false,false),(a.event_authority.to_account_info(),false,false),(a.launchlab.to_account_info(),false,false)
 ],initialize_data(&a.window,target),&[launcher_seeds,mint_seeds])?;
 for (account,owner) in [(a.buyer_base.to_account_info(),a.launcher.to_account_info()),(a.claim_vault.to_account_info(),a.window.to_account_info())]{associated_token::create_idempotent(CpiContext::new_with_signer(a.associated_token_program.to_account_info(),associated_token::Create{payer:a.launcher.to_account_info(),associated_token:account,authority:owner,mint:a.mint.to_account_info(),system_program:a.system_program.to_account_info(),token_program:a.token_program.to_account_info()},&[launcher_seeds]))?;}
 if creator_buy>0{associated_token::create_idempotent(CpiContext::new_with_signer(a.associated_token_program.to_account_info(),associated_token::Create{payer:a.launcher.to_account_info(),associated_token:a.creator_base.to_account_info(),authority:a.creator.to_account_info(),mint:a.mint.to_account_info(),system_program:a.system_program.to_account_info(),token_program:a.token_program.to_account_info()},&[launcher_seeds]))?;}
 let before_base=base_amount(&a.buyer_base)?;let before_quote=qamount(&a.escrow)?;require!(before_quote>=budget,ErrCode::Amount);
 raw_cpi(a.launchlab.to_account_info(),vec![
 (a.launcher.to_account_info(),true,true),(a.authority.to_account_info(),false,false),(a.global.to_account_info(),false,false),(a.platform.to_account_info(),false,false),(a.pool.to_account_info(),true,false),(a.buyer_base.to_account_info(),true,false),(a.escrow.to_account_info(),true,false),(a.base_vault.to_account_info(),true,false),(a.quote_vault.to_account_info(),true,false),(a.mint.to_account_info(),false,false),(a.quote_mint.to_account_info(),false,false),(a.token_program.to_account_info(),false,false),(a.quote_token_program.to_account_info(),false,false),(a.event_authority.to_account_info(),false,false),(a.launchlab.to_account_info(),false,false),(a.system_program.to_account_info(),false,false),(a.platform_fee_vault.to_account_info(),true,false),(a.creator_fee_vault.to_account_info(),true,false)
 ],buy_data(budget,1),&[launcher_seeds])?;
 let bought=base_amount(&a.buyer_base)?.checked_sub(before_base).ok_or(ErrCode::Amount)?;let spent=before_quote.checked_sub(qamount(&a.escrow)?).ok_or(ErrCode::Amount)?;
 let pool=a.pool.try_borrow_data()?;require!(pool.len()==429&&pool[..8]==[247,237,227,245,215,195,222,70],ErrCode::State);let status=pool[17];require_keys_eq!(key_at(&pool,205)?,a.window.mint,ErrCode::Config);require_keys_eq!(key_at(&pool,333)?,a.launcher.key(),ErrCode::Config);require!(u64_at(&pool,53)?==bought&&u64_at(&pool,69)?==target,ErrCode::Amount);drop(pool);
 require!(bought>0&&spent<=budget&&(spent==budget||status!=0),ErrCode::Amount);
 let (creator_spent,creator_tokens)=split_first_buy(budget,creator_buy,spent,bought)?;let window_tokens=bought-creator_tokens;let pledge_spent=spent-creator_spent;
 let dev_locked=a.window.vest_at>a.window.created_at;
 if creator_tokens>0{token::transfer(CpiContext::new_with_signer(a.token_program.to_account_info(),Transfer{from:a.buyer_base.to_account_info(),to:if dev_locked{a.claim_vault.to_account_info()}else{a.creator_base.to_account_info()},authority:a.launcher.to_account_info()},&[launcher_seeds]),creator_tokens)?;}
 if window_tokens>0{token::transfer(CpiContext::new_with_signer(a.token_program.to_account_info(),Transfer{from:a.buyer_base.to_account_info(),to:a.claim_vault.to_account_info(),authority:a.launcher.to_account_info()},&[launcher_seeds]),window_tokens)?;}
 // Unspent creator quote goes straight back; unspent pledge quote stays in escrow for claim().
 let creator_refund=creator_buy-creator_spent;
 if creator_refund>0{associated_token::create_idempotent(CpiContext::new_with_signer(a.associated_token_program.to_account_info(),associated_token::Create{payer:a.launcher.to_account_info(),associated_token:a.creator_quote.to_account_info(),authority:a.creator.to_account_info(),mint:a.quote_mint.to_account_info(),system_program:a.system_program.to_account_info(),token_program:a.quote_token_program.to_account_info()},&[launcher_seeds]))?;
  xfer(&a.quote_token_program.to_account_info(),a.escrow.to_account_info(),&a.quote_mint,a.creator_quote.to_account_info(),a.launcher.to_account_info(),creator_refund,&[launcher_seeds])?;}
 let pool_key=a.pool.key();let w=&mut ctx.accounts.window;w.raised=pledge_spent;w.window_tokens=window_tokens;w.creator_buy_tokens=creator_tokens;w.dev_claimed=!dev_locked||creator_tokens==0;w.state=LIVE;w.pool=pool_key;
 emit!(WindowSettled{window:w.key(),state:w.state,raised:pledge_spent});emit!(launchlab::FirstBuy{window:w.key(),spent,bought,creator_spent,creator_tokens,migration_pending:status!=0});Ok(())
}
pub fn q_fees(ctx:Context<QuoteCreatorFees>)->Result<()>{
 let a=&ctx.accounts;require!(a.window.state==LIVE,ErrCode::State);let wk=a.window.key();let bump=[a.window.launcher_bump];let s:&[&[u8]]=&[b"launcher",wk.as_ref(),&bump];let before=qamount(&a.escrow)?;
 raw_cpi(a.launchlab.to_account_info(),vec![(a.launcher.to_account_info(),true,true),(a.fee_authority.to_account_info(),false,false),(a.fee_vault.to_account_info(),true,false),(a.escrow.to_account_info(),true,false),(a.quote_mint.to_account_info(),false,false),(a.token_program.to_account_info(),false,false),(a.system_program.to_account_info(),false,false),(a.associated_token_program.to_account_info(),false,false)],vec![26,97,138,203,132,171,141,252],&[s])?;
 // Only the measured fee delta leaves escrow; refund principal for unclaimed pledges is untouched.
 let amount=qamount(&a.escrow)?.checked_sub(before).ok_or(ErrCode::Amount)?;
 xfer(&a.token_program.to_account_info(),a.escrow.to_account_info(),&a.quote_mint,a.creator_quote.to_account_info(),a.launcher.to_account_info(),amount,&[s])?;
 emit!(launchlab::CreatorFeesClaimed{window:wk,creator:a.creator.key(),amount});Ok(())
}
#[event]pub struct QuoteSet{pub mint:Pubkey,pub global:Pubkey,pub enabled:bool}
#[event]pub struct QuoteWindowCreated{pub window:Pubkey,pub quote_mint:Pubkey,pub target:u64,pub creator_buy:u64}

#[derive(Accounts)]pub struct SetQuote<'info>{
 #[account(seeds=[b"config"],bump=config.bump,has_one=authority)]pub config:Account<'info,Config>,#[account(mut)]pub authority:Signer<'info>,
 #[account(init_if_needed,payer=authority,space=8+QuoteConfig::INIT_SPACE,seeds=[b"quote",quote_mint.key().as_ref()],bump)]pub quote_config:Account<'info,QuoteConfig>,
 #[account(mint::token_program=token_program)]pub quote_mint:InterfaceAccount<'info,QMint>,
 /// CHECK: LaunchLab GlobalConfig for this quote; owner, layout, economics and mintB checked in handler.
 pub global:UncheckedAccount<'info>,
 /// CHECK: pinned platform; checked in handler.
 #[account(address=config.platform)]pub platform:UncheckedAccount<'info>,
 pub token_program:Interface<'info,TokenInterface>,pub system_program:Program<'info,System>
}
#[derive(Accounts)]#[instruction(params:CreateParams)]pub struct CreateCoinQuote<'info>{
 #[account(seeds=[b"config"],bump=config.bump)]pub config:Box<Account<'info,Config>>,
 #[account(seeds=[b"quote",quote_mint.key().as_ref()],bump=quote_config.bump)]pub quote_config:Box<Account<'info,QuoteConfig>>,
 #[account(mut)]pub creator:Signer<'info>,
 /// CHECK: reserved, uninitialized mint PDA (LaunchLab creates the mint at settlement).
 #[account(seeds=[b"mint",creator.key().as_ref(),&params.nonce.to_le_bytes()],bump,constraint=mint.data_is_empty() @ ErrCode::State,owner=anchor_lang::system_program::ID)]pub mint:UncheckedAccount<'info>,
 #[account(init,payer=creator,space=8+Window::INIT_SPACE,seeds=[b"window",mint.key().as_ref()],bump)]pub window:Box<Account<'info,Window>>,
 #[account(mut,seeds=[b"launcher",window.key().as_ref()],bump)]pub launcher:SystemAccount<'info>,
 /// CHECK: quote GlobalConfig registered in quote_config; fields verified in handler.
 #[account(address=quote_config.global)]pub global:UncheckedAccount<'info>,
 /// CHECK: configured platform; fields verified in handler.
 #[account(address=config.platform)]pub platform:UncheckedAccount<'info>,
 /// CHECK: immutable fee recipient (SOL creation fee).
 #[account(mut,address=config.fee_owner)]pub treasury:UncheckedAccount<'info>,
 #[account(address=quote_config.mint,mint::token_program=token_program)]pub quote_mint:Box<InterfaceAccount<'info,QMint>>,
 /// CHECK: canonical escrow ATA (launcher, quote mint); created here.
 #[account(mut,address=ata_with(&launcher.key(),&quote_mint.key(),&token_program.key()))]pub escrow:UncheckedAccount<'info>,
 /// CHECK: creator's quote source; only read by the token program when creator_buy > 0.
 #[account(mut)]pub creator_quote:UncheckedAccount<'info>,
 /// CHECK: instructions sysvar; ed25519 price attestation verified in handler.
 #[account(address=anchor_lang::solana_program::sysvar::instructions::ID)]pub instructions:UncheckedAccount<'info>,
 #[account(address=quote_config.token_program)]pub token_program:Interface<'info,TokenInterface>,pub associated_token_program:Program<'info,AssociatedToken>,pub system_program:Program<'info,System>
}
#[derive(Accounts)]#[instruction(amount:u64,cluster:[u8;32])]pub struct PledgeQuote<'info>{
 #[account(seeds=[b"config"],bump=config.bump)]pub config:Box<Account<'info,Config>>,
 #[account(mut,seeds=[b"window",window.mint.as_ref()],bump=window.bump,constraint=!is_sol(&window) @ ErrCode::State)]pub window:Box<Account<'info,Window>>,
 #[account(seeds=[b"quote",quote_mint.key().as_ref()],bump=quote_config.bump,constraint=quote_config.global==window.global @ ErrCode::Config)]pub quote_config:Box<Account<'info,QuoteConfig>>,
 #[account(mut)]pub wallet:Signer<'info>,
 #[account(init_if_needed,payer=wallet,space=8+Pledge::INIT_SPACE,seeds=[b"pledge",window.key().as_ref(),wallet.key().as_ref()],bump)]pub pledge:Box<Account<'info,Pledge>>,
 #[account(init_if_needed,payer=wallet,space=8+ClusterCap::INIT_SPACE,seeds=[b"cluster",window.key().as_ref(),cluster.as_ref()],bump)]pub cluster_cap:Box<Account<'info,ClusterCap>>,
 /// CHECK: launcher PDA (escrow authority).
 #[account(seeds=[b"launcher",window.key().as_ref()],bump=window.launcher_bump)]pub launcher:UncheckedAccount<'info>,
 #[account(address=quote_config.mint)]pub quote_mint:Box<InterfaceAccount<'info,QMint>>,
 /// CHECK: canonical escrow ATA.
 #[account(mut,address=ata_with(&launcher.key(),&quote_mint.key(),&token_program.key()))]pub escrow:UncheckedAccount<'info>,
 #[account(mut,token::mint=quote_mint,token::authority=wallet,token::token_program=token_program)]pub wallet_quote:Box<InterfaceAccount<'info,QAccount>>,
 /// CHECK: instructions sysvar.
 #[account(address=anchor_lang::solana_program::sysvar::instructions::ID)]pub instructions:UncheckedAccount<'info>,
 #[account(address=quote_config.token_program)]pub token_program:Interface<'info,TokenInterface>,pub system_program:Program<'info,System>
}
#[derive(Accounts)]pub struct QuoteRefund<'info>{
 #[account(mut,seeds=[b"window",window.mint.as_ref()],bump=window.bump,constraint=!is_sol(&window) @ ErrCode::State)]pub window:Box<Account<'info,Window>>,
 #[account(mut)]pub wallet:Signer<'info>,
 #[account(mut,seeds=[b"pledge",window.key().as_ref(),wallet.key().as_ref()],bump=pledge.bump,has_one=wallet,has_one=window)]pub pledge:Box<Account<'info,Pledge>>,
 #[account(seeds=[b"quote",quote_mint.key().as_ref()],bump=quote_config.bump,constraint=quote_config.global==window.global @ ErrCode::Config)]pub quote_config:Box<Account<'info,QuoteConfig>>,
 /// CHECK: launcher PDA (escrow authority).
 #[account(seeds=[b"launcher",window.key().as_ref()],bump=window.launcher_bump)]pub launcher:UncheckedAccount<'info>,
 #[account(address=quote_config.mint)]pub quote_mint:Box<InterfaceAccount<'info,QMint>>,
 /// CHECK: canonical escrow ATA.
 #[account(mut,address=ata_with(&launcher.key(),&quote_mint.key(),&token_program.key()))]pub escrow:UncheckedAccount<'info>,
 #[account(mut,token::mint=quote_mint,token::authority=wallet,token::token_program=token_program)]pub wallet_quote:Box<InterfaceAccount<'info,QAccount>>,
 #[account(address=quote_config.token_program)]pub token_program:Interface<'info,TokenInterface>
}
#[derive(Accounts)]pub struct QuoteClaim<'info>{
 #[account(mut,seeds=[b"window",window.mint.as_ref()],bump=window.bump,constraint=!is_sol(&window) @ ErrCode::State)]pub window:Box<Account<'info,Window>>,
 #[account(mut)]pub wallet:Signer<'info>,
 #[account(mut,seeds=[b"pledge",window.key().as_ref(),wallet.key().as_ref()],bump=pledge.bump,has_one=wallet,has_one=window)]pub pledge:Box<Account<'info,Pledge>>,
 #[account(mut,address=anchor_spl::associated_token::get_associated_token_address(&window.key(),&window.mint),token::authority=window,token::mint=window.mint)]pub token_vault:Box<Account<'info,TokenAccount>>,
 #[account(mut,token::authority=wallet,token::mint=window.mint)]pub destination:Box<Account<'info,TokenAccount>>,
 #[account(seeds=[b"quote",quote_mint.key().as_ref()],bump=quote_config.bump,constraint=quote_config.global==window.global @ ErrCode::Config)]pub quote_config:Box<Account<'info,QuoteConfig>>,
 /// CHECK: launcher PDA (escrow authority).
 #[account(seeds=[b"launcher",window.key().as_ref()],bump=window.launcher_bump)]pub launcher:UncheckedAccount<'info>,
 #[account(address=quote_config.mint)]pub quote_mint:Box<InterfaceAccount<'info,QMint>>,
 /// CHECK: canonical escrow ATA.
 #[account(mut,address=ata_with(&launcher.key(),&quote_mint.key(),&quote_token_program.key()))]pub escrow:UncheckedAccount<'info>,
 #[account(mut,token::mint=quote_mint,token::authority=wallet,token::token_program=quote_token_program)]pub wallet_quote:Box<InterfaceAccount<'info,QAccount>>,
 pub token_program:Program<'info,Token>,#[account(address=quote_config.token_program)]pub quote_token_program:Interface<'info,TokenInterface>
}
#[derive(Accounts)]pub struct QuoteCreatorRefund<'info>{
 #[account(mut,seeds=[b"window",window.mint.as_ref()],bump=window.bump,has_one=creator,constraint=!is_sol(&window) @ ErrCode::State)]pub window:Box<Account<'info,Window>>,
 #[account(mut)]pub creator:Signer<'info>,
 #[account(seeds=[b"quote",quote_mint.key().as_ref()],bump=quote_config.bump,constraint=quote_config.global==window.global @ ErrCode::Config)]pub quote_config:Box<Account<'info,QuoteConfig>>,
 /// CHECK: launcher PDA (escrow authority).
 #[account(seeds=[b"launcher",window.key().as_ref()],bump=window.launcher_bump)]pub launcher:UncheckedAccount<'info>,
 #[account(address=quote_config.mint)]pub quote_mint:Box<InterfaceAccount<'info,QMint>>,
 /// CHECK: canonical escrow ATA.
 #[account(mut,address=ata_with(&launcher.key(),&quote_mint.key(),&token_program.key()))]pub escrow:UncheckedAccount<'info>,
 #[account(mut,token::mint=quote_mint,token::authority=creator,token::token_program=token_program)]pub creator_quote:Box<InterfaceAccount<'info,QAccount>>,
 #[account(address=quote_config.token_program)]pub token_program:Interface<'info,TokenInterface>
}
#[derive(Accounts)]pub struct SettleQuote<'info>{
 #[account(mut,seeds=[b"window",window.mint.as_ref()],bump=window.bump,constraint=!is_sol(&window) @ ErrCode::State)]pub window:Box<Account<'info,Window>>,
 #[account(seeds=[b"quote",quote_mint.key().as_ref()],bump=quote_config.bump,constraint=quote_config.global==window.global @ ErrCode::Config)]pub quote_config:Box<Account<'info,QuoteConfig>>,
 /// CHECK: reserved mint PDA, initialized by the verified LaunchLab CPI only.
 #[account(mut,address=window.mint,seeds=[b"mint",window.creator.as_ref(),&window.nonce.to_le_bytes()],bump=window.mint_bump)]pub mint:UncheckedAccount<'info>,
 #[account(mut,seeds=[b"launcher",window.key().as_ref()],bump=window.launcher_bump)]pub launcher:SystemAccount<'info>,
 /// CHECK: pinned executable.
 #[account(address=LAUNCHLAB,executable)]pub launchlab:UncheckedAccount<'info>,
 /// CHECK: hash-checked.
 #[account(address=window.global)]pub global:UncheckedAccount<'info>,
 /// CHECK: hash-checked.
 #[account(address=window.platform)]pub platform:UncheckedAccount<'info>,
 /// CHECK: canonical LaunchLab PDA.
 #[account(address=pda(&[b"vault_auth_seed"]))]pub authority:UncheckedAccount<'info>,
 /// CHECK: canonical pool PDA for (mint, quote).
 #[account(mut,address=pda(&[b"pool",window.mint.as_ref(),quote_mint.key().as_ref()]))]pub pool:UncheckedAccount<'info>,
 #[account(address=quote_config.mint)]pub quote_mint:Box<InterfaceAccount<'info,QMint>>,
 /// CHECK: canonical base vault.
 #[account(mut,address=pda(&[b"pool_vault",pool.key().as_ref(),window.mint.as_ref()]))]pub base_vault:UncheckedAccount<'info>,
 /// CHECK: canonical quote vault.
 #[account(mut,address=pda(&[b"pool_vault",pool.key().as_ref(),quote_mint.key().as_ref()]))]pub quote_vault:UncheckedAccount<'info>,
 /// CHECK: canonical Metaplex metadata.
 #[account(mut,address=Pubkey::find_program_address(&[b"metadata",METADATA.as_ref(),window.mint.as_ref()],&METADATA).0)]pub metadata:UncheckedAccount<'info>,
 /// CHECK: canonical launcher base ATA.
 #[account(mut,address=anchor_spl::associated_token::get_associated_token_address(&launcher.key(),&window.mint))]pub buyer_base:UncheckedAccount<'info>,
 /// CHECK: canonical escrow ATA (launcher, quote) = LaunchLab user quote account.
 #[account(mut,address=ata_with(&launcher.key(),&quote_mint.key(),&quote_token_program.key()))]pub escrow:UncheckedAccount<'info>,
 /// CHECK: immutable creator.
 #[account(mut,address=window.creator)]pub creator:UncheckedAccount<'info>,
 /// CHECK: canonical creator base ATA.
 #[account(mut,address=anchor_spl::associated_token::get_associated_token_address(&window.creator,&window.mint))]pub creator_base:UncheckedAccount<'info>,
 /// CHECK: canonical creator quote ATA (receives unspent creator buy).
 #[account(mut,address=ata_with(&window.creator,&quote_mint.key(),&quote_token_program.key()))]pub creator_quote:UncheckedAccount<'info>,
 /// CHECK: canonical claim ATA.
 #[account(mut,address=anchor_spl::associated_token::get_associated_token_address(&window.key(),&window.mint))]pub claim_vault:UncheckedAccount<'info>,
 /// CHECK: canonical platform fee vault for this quote.
 #[account(mut,address=pda(&[window.platform.as_ref(),quote_mint.key().as_ref()]))]pub platform_fee_vault:UncheckedAccount<'info>,
 /// CHECK: canonical creator fee vault for this quote.
 #[account(mut,address=pda(&[launcher.key().as_ref(),quote_mint.key().as_ref()]))]pub creator_fee_vault:UncheckedAccount<'info>,
 /// CHECK: canonical event authority.
 #[account(address=pda(&[b"__event_authority"]))]pub event_authority:UncheckedAccount<'info>,
 /// CHECK: fixed Metaplex program.
 #[account(address=METADATA,executable)]pub metadata_program:UncheckedAccount<'info>,
 pub token_program:Program<'info,Token>,#[account(address=quote_config.token_program)]pub quote_token_program:Interface<'info,TokenInterface>,
 pub associated_token_program:Program<'info,AssociatedToken>,pub system_program:Program<'info,System>,pub rent:Sysvar<'info,Rent>
}
#[derive(Accounts)]pub struct QuoteCreatorFees<'info>{
 #[account(seeds=[b"window",window.mint.as_ref()],bump=window.bump,has_one=creator,constraint=!is_sol(&window) @ ErrCode::State)]pub window:Box<Account<'info,Window>>,#[account(mut)]pub creator:Signer<'info>,
 #[account(seeds=[b"quote",quote_mint.key().as_ref()],bump=quote_config.bump,constraint=quote_config.global==window.global @ ErrCode::Config)]pub quote_config:Box<Account<'info,QuoteConfig>>,
 #[account(mut,seeds=[b"launcher",window.key().as_ref()],bump=window.launcher_bump)]pub launcher:SystemAccount<'info>,
 /// CHECK: pinned executable.
 #[account(address=LAUNCHLAB,executable)]pub launchlab:UncheckedAccount<'info>,
 /// CHECK: canonical creator fee authority.
 #[account(address=pda(&[b"creator_fee_vault_auth_seed"]))]pub fee_authority:UncheckedAccount<'info>,
 /// CHECK: canonical per-launch fee vault for this quote.
 #[account(mut,address=pda(&[launcher.key().as_ref(),quote_mint.key().as_ref()]))]pub fee_vault:UncheckedAccount<'info>,
 #[account(address=quote_config.mint)]pub quote_mint:Box<InterfaceAccount<'info,QMint>>,
 /// CHECK: canonical escrow ATA = LaunchLab fee recipient (launcher's quote ATA).
 #[account(mut,address=ata_with(&launcher.key(),&quote_mint.key(),&token_program.key()))]pub escrow:UncheckedAccount<'info>,
 #[account(init_if_needed,payer=creator,associated_token::mint=quote_mint,associated_token::authority=creator,associated_token::token_program=token_program)]pub creator_quote:Box<InterfaceAccount<'info,QAccount>>,
 #[account(address=quote_config.token_program)]pub token_program:Interface<'info,TokenInterface>,pub associated_token_program:Program<'info,AssociatedToken>,pub system_program:Program<'info,System>
}
#[cfg(test)]mod tests{use super::*;
 #[test]fn sol_headroom_matches(){assert_eq!(max_first_buy(GRADUATION_QUOTE).unwrap(),MAX_FIRST_BUY);assert_eq!(max_first_buy(85_000_000_000).unwrap(),86_000_000_000);/* 85 SOL ≈ $12,750 at $150 → 12,750 USDC (6 dp) */assert_eq!(max_first_buy(12_750_000_000).unwrap(),12_900_000_000);}
 #[test]fn quote_message_binds_mint_and_target(){let p=Pubkey::new_unique();let m=Pubkey::new_unique();assert_ne!(quote_message(&p,&m,1,9),quote_message(&p,&m,2,9));assert_ne!(quote_message(&p,&m,1,9),quote_message(&p,&Pubkey::new_unique(),1,9));}
}
