//! Funded, immutable Scout epochs. Claims are bound to program, epoch and wallet.
use super::*;
use solana_sha256_hasher::hashv;
#[derive(Accounts)]#[instruction(epoch:u64)]
pub struct FundScoutEpoch<'info>{
 #[account(seeds=[b"config"],bump=config.bump,has_one=authority)]pub config:Account<'info,Config>,
 #[account(mut)]pub authority:Signer<'info>,
 #[account(init,payer=authority,space=8+ScoutEpoch::INIT_SPACE,seeds=[b"scout".as_ref(),&epoch.to_le_bytes()],bump)]pub distribution:Account<'info,ScoutEpoch>,
 pub system_program:Program<'info,System>
}
#[derive(Accounts)]pub struct ClaimScout<'info>{
 #[account(mut,seeds=[b"scout",&distribution.epoch.to_le_bytes()],bump=distribution.bump)]pub distribution:Account<'info,ScoutEpoch>,
 #[account(mut)]pub wallet:Signer<'info>,
 #[account(init,payer=wallet,space=8+ScoutReceipt::INIT_SPACE,seeds=[b"scout-claim",distribution.key().as_ref(),wallet.key().as_ref()],bump)]pub receipt:Account<'info,ScoutReceipt>,
 pub system_program:Program<'info,System>
}
#[account]#[derive(InitSpace)]pub struct ScoutEpoch{pub epoch:u64,pub root:[u8;32],pub budget:u64,pub claimed:u64,pub bump:u8}
#[account]#[derive(InitSpace)]pub struct ScoutReceipt{pub amount:u64}
pub fn fund(ctx:Context<FundScoutEpoch>,epoch:u64,root:[u8;32],budget:u64)->Result<()>{
 require!(!ctx.accounts.config.paused&&budget>0&&root!=[0;32],ErrCode::Config);
 // SOL is transferred in the same transaction that publishes the root. No IOUs.
 anchor_lang::system_program::transfer(CpiContext::new(ctx.accounts.system_program.to_account_info(),anchor_lang::system_program::Transfer{from:ctx.accounts.authority.to_account_info(),to:ctx.accounts.distribution.to_account_info()}),budget)?;
 let d=&mut ctx.accounts.distribution;d.epoch=epoch;d.root=root;d.budget=budget;d.bump=ctx.bumps.distribution;
 emit!(ScoutFunded{epoch,root,budget});Ok(())
}
pub fn leaf(program:&Pubkey,epoch:u64,wallet:&Pubkey,amount:u64)->[u8;32]{hashv(&[b"floof-scout-v2",program.as_ref(),&epoch.to_le_bytes(),wallet.as_ref(),&amount.to_le_bytes()]).to_bytes()}
pub fn parent(a:[u8;32],b:[u8;32])->[u8;32]{if a<=b{hashv(&[b"floof-scout-node-v2",&a,&b]).to_bytes()}else{hashv(&[b"floof-scout-node-v2",&b,&a]).to_bytes()}}
pub fn verify(root:[u8;32],leaf:[u8;32],proof:&[[u8;32]])->bool{proof.len()<=32&&proof.iter().fold(leaf,|node,sibling|parent(node,*sibling))==root}
pub fn claim(ctx:Context<ClaimScout>,amount:u64,proof:Vec<[u8;32]>)->Result<()>{
 let d=&mut ctx.accounts.distribution;require!(amount>0&&verify(d.root,leaf(&crate::ID,d.epoch,&ctx.accounts.wallet.key(),amount),&proof),ErrCode::Proof);
 let next=d.claimed.checked_add(amount).ok_or(ErrCode::Overflow)?;require!(next<=d.budget,ErrCode::Amount);
 move_lamports(&d.to_account_info(),&ctx.accounts.wallet.to_account_info(),amount)?;d.claimed=next;ctx.accounts.receipt.amount=amount;
 emit!(ScoutClaimed{epoch:d.epoch,wallet:ctx.accounts.wallet.key(),amount});Ok(())
}
#[event]pub struct ScoutFunded{pub epoch:u64,pub root:[u8;32],pub budget:u64}
#[event]pub struct ScoutClaimed{pub epoch:u64,pub wallet:Pubkey,pub amount:u64}
#[cfg(test)]mod tests{use super::*;
 #[test]fn proof_binds_wallet_program_amount_epoch(){let p=Pubkey::new_unique();let w=Pubkey::new_unique();let l=leaf(&p,42,&w,100);let sibling=leaf(&p,42,&Pubkey::new_unique(),200);let root=parent(l,sibling);assert!(verify(root,l,&[sibling]));for bad in [leaf(&p,43,&w,100),leaf(&p,42,&w,101),leaf(&p,42,&Pubkey::new_unique(),100),leaf(&Pubkey::new_unique(),42,&w,100)]{assert!(!verify(root,bad,&[sibling]))}assert!(!verify(root,l,&[[0;32];33]));}
 #[test]fn matches_javascript_vector(){assert_eq!(leaf(&Pubkey::new_from_array([1;32]),42,&Pubkey::new_from_array([3;32]),100),[57,63,156,242,101,101,182,247,177,235,138,12,11,41,208,60,110,133,102,63,94,116,93,103,150,164,115,190,234,191,255,223]);}
 #[test]fn sorted_pair_is_order_independent(){assert_eq!(parent([1;32],[2;32]),parent([2;32],[1;32]));}
}
