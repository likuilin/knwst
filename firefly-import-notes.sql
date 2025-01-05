alter table transactions auto_increment 10;
insert into transactions
(firefly_tjid, firefly_created_at, firefly_updated_at, firefly_txtypeid, firefly_txgroupid, firefly_billid,
d, title_com, category, comment_com)
select id, created_at, updated_at, transaction_type_id, transaction_group_id, bill_id,
`date`, description, "TODO", concat("Firefly Import id=",id,
",created_at=",created_at,
",updated_at=",updated_at,
",transaction_type_id=",ifnull(transaction_type_id, "NULL"),
",transaction_group_id=",ifnull(transaction_group_id, "NULL"),
",bill_id=",ifnull(bill_id, "NULL"),
",description=",description,
",date=",`date`) from 
firefly.transaction_journals where deleted_at is null;

alter table journals_cash auto_increment 10;
insert into journals_cash
(firefly_id, created_at, updated_at, firefly_account_id, firefly_tjid, firefly_amount, comment_com)
select id, created_at, updated_at, account_id, transaction_journal_id, amount,
concat("Firefly Import id=",id,
",created_at=",created_at,
",updated_at=",updated_at,
",account_id=",account_id,
",transaction_journal_id=",transaction_journal_id,
",amount=",amount) from 
firefly.transactions where deleted_at is null;

update journals_cash set created_at="2025-01-01 05:00:00", updated_at="2025-01-01 05:00:00" where created_at is null and updated_at is null;
update journals_cash set amount=firefly_amount where amount is null;
select jcid, amount, firefly_amount, abs(amount - firefly_amount) as d from journals_cash where amount != firefly_amount order by d desc;


update journals_cash as jc, transactions as tx set jc.txid=tx.txid where jc.firefly_tjid=tx.firefly_tjid and jc.txid is null;



ALTER TABLE `journals_cash`
ADD FOREIGN KEY (`txid`) REFERENCES `transactions` (`txid`),
ADD FOREIGN KEY (`acctid`) REFERENCES `accounts` (`acctid`);

update journals_cash as jc set acctid=(select acctid from accounts where binary name=(select name from firefly.accounts where firefly.accounts.id=jc.firefly_account_id)) where acctid is null

select journals_cash.*, firefly.accounts.name from journals_cash left join firefly.accounts on firefly.accounts.id=journals_cash.firefly_account_id where acctid is null;


-- TODO MANUALLY FIX acctid = null in journals_cash
select count(*), firefly_account_id, firefly.accounts.name from journals_cash left join firefly.accounts on firefly.accounts.id=journals_cash.firefly_account_id where acctid is null group by firefly_account_id;


update journals_cash as jc, transactions as tx set jc.dphys = tx.d where jc.txid=tx.txid and jc.dphys is NULL and jc.firefly_id is not NULL

-- remove initial balance txs
select * from journals_cash where txid in (1129, 1130, 1131, 3741);
select * from transactions where txid in (1129, 1130, 1131, 3741);


select j.acctid, accounts.name, sum(amount) from journals_cash j
left join accounts on accounts.acctid=j.acctid
where accounts.internal and not accounts.temp_market_acct group by j.acctid;

