//! Oracle-approved current-holder snapshots. Claims are funded by the existing bond.
//! A root is immutable, domain bound to this program/window/slot, and jointly signed.
use super::*;
use solana_sha256_hasher::hashv;
#[derive(Accounts)]pub struct ClaimCompensation<'info>{
 #[account(seeds=[b"window",window.mint.as_ref()],bump=window.bump)]pub window:Account<'info,Window>,
 #[account(mut,seeds=[b"bond",window.key().as_ref()],bump=bond.bump,has_one=window)]pub bond:Account<'info,Bond>,
 #[account(mut)]pub wallet:Signer<'info>,
 #[account(init,payer=wallet,space=8+CompensationReceipt::INIT_SPACE,seeds=[b"compensation",window.key().as_ref(),wallet.key().as_ref()],bump)]pub receipt:Account<'info,CompensationReceipt>,
 pub system_program:Program<'info,System>
}
#[account]#[derive(InitSpace)]pub struct CompensationReceipt{pub amount:u64}
pub fn leaf(program:&Pubkey,window:&Pubkey,slot:u64,wallet:&Pubkey,amount:u64)->[u8;32]{hashv(&[b"floof-holder-v1",program.as_ref(),window.as_ref(),&slot.to_le_bytes(),wallet.as_ref(),&amount.to_le_bytes()]).to_bytes()}
pub fn claim(ctx:Context<ClaimCompensation>,amount:u64,proof:Vec<[u8;32]>)->Result<()>{
 let b=&mut ctx.accounts.bond;require!(b.slashed&&amount>0&&rewards::verify(b.holder_root,leaf(&crate::ID,&ctx.accounts.window.key(),b.snapshot_slot,&ctx.accounts.wallet.key(),amount),&proof),ErrCode::Proof);
 let next=b.compensation_paid.checked_add(amount).ok_or(ErrCode::Overflow)?;require!(next<=b.amount,ErrCode::Amount);
 move_lamports(&b.to_account_info(),&ctx.accounts.wallet.to_account_info(),amount)?;b.compensation_paid=next;ctx.accounts.receipt.amount=amount;
 emit!(HolderCompensated{window:ctx.accounts.window.key(),wallet:ctx.accounts.wallet.key(),amount});Ok(())
}
#[event]pub struct HolderCompensated{pub window:Pubkey,pub wallet:Pubkey,pub amount:u64}
#[cfg(test)]mod tests{use super::*;
 #[test]fn holder_proof_cannot_cross_windows_or_snapshots(){let p=Pubkey::new_unique();let w=Pubkey::new_unique();let a=Pubkey::new_unique();let root=leaf(&p,&w,10,&a,99);assert!(rewards::verify(root,root,&[]));for wrong in [leaf(&p,&w,11,&a,99),leaf(&p,&Pubkey::new_unique(),10,&a,99),leaf(&p,&w,10,&a,100),leaf(&p,&w,10,&Pubkey::new_unique(),99)]{assert!(!rewards::verify(root,wrong,&[]))}}
}
