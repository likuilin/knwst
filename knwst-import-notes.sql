

alter table transactions auto_increment 10;
insert into transactions (created_at, updated_at, d, title_com, category, comment_com, knwst_txid)
select created, updated, `date`, "TODO knwst import", "TODO", concat("Imported knwst txid=",ifnull(txid,"NULL"),
",created=",ifnull(created,"NULL"),
",updated=",ifnull(updated,"NULL"),
",date=",ifnull(date,"NULL"),
",ticker=",ifnull(ticker,"NULL"),
",action=",ifnull(action,"NULL"),
",amount=",ifnull(amount,"NULL"),
",price_comment=",ifnull(price_comment,"NULL"),
",comm_comment=",ifnull(comm_comment,"NULL"),
",net=",ifnull(net,"NULL"),
",brokerage=",ifnull(brokerage,"NULL"),
",special=",ifnull(special,"NULL"),
",note_comment=",ifnull(note_comment,"NULL"),
",confirm_comment=",ifnull(confirm_comment,"NULL")), txid from temp_txs order by txid asc;

acats
assign
buy
buy close
dividend
exercise
interest
rename
sell
sell short
split
transfer

-- ================ cash for all of them

alter table journals_cash auto_increment 10;
insert into journals_cash (created_at, updated_at, dphys, amount, knwst_txid, knwst_brokerage, knwst_side, knwst_action)
select created, updated, `date`, net, txid, brokerage, 0, action
from temp_txs order by txid asc;

alter table journals_cash auto_increment 10;
insert into journals_cash (acctid, created_at, updated_at, dphys, amount, knwst_txid, knwst_brokerage, knwst_side, knwst_action)
select 9997, created, updated, `date`, -net, txid, brokerage, 1, action
from temp_txs order by txid asc;

update journals_cash set acctid=(select acctid from accounts where accounts.name=knwst_brokerage) where acctid is null and knwst_brokerage is not null;

select * from journals_cash where acctid is null and knwst_brokerage is not null group by knwst_brokerage


update journals_cash set acctid=19 where knwst_brokerage="Computershare";
update journals_cash set acctid=42 where knwst_brokerage="Defi";
update journals_cash set acctid=24 where knwst_brokerage="IBKR";
update journals_cash set acctid=30 where knwst_brokerage="Slavic 401k FISDB";
update journals_cash set acctid=29 where knwst_brokerage="Slavic 401k Roth Excl FISDB";
update journals_cash set acctid=26 where knwst_brokerage="Slavic 401k Trad Excl FISDB";
update journals_cash set acctid=27 where knwst_brokerage="Slavic 401k Trad Match Excl FISDB";

-- double check, argh
select accounts.* from journals_cash 
left join accounts on accounts.acctid=journals_cash.acctid 
where knwst_brokerage is not null group by journals_cash.acctid;

-- whoops, chase was mis-labelled, acorns too
select * from journals_cash where acctid=1071 and knwst_brokerage is not null;

update journals_cash set acctid=4 where knwst_brokerage="Chase";
update journals_cash set acctid=44 where knwst_brokerage="Acorns";
update journals_cash set acctid=38 where knwst_brokerage="ETrade";
update journals_cash set acctid=35 where knwst_brokerage="Fidelity";
update journals_cash set acctid=40 where knwst_brokerage="Robinhood";

  -- whoops whoops
  update journals_cash set acctid=9997 where knwst_side=1;


-- ================ asset for some of them


-- actions that dispose of assets: sell, buy close / acats, split, rename / assign, exercise (the option position) / assign close, exercise close (the underlying)
-- actions that give us assets: buy, sell short / acats, split, rename / assign open, exercise open (the underlying)

select * from temp_txs where action in ('assign','exercise')
-- let's do the assign/exercise manually, everything else now, there's only ten

-- set up tax lots first

alter table tax_lots auto_increment 0;
insert into tax_lots (ticker, amount, basis, knwst_txid, knwst_brokerage, knwst_action, knwst_special) 
select ticker, amount, net, txid, brokerage, action, special from temp_txs where action in ("buy", "sell short", "acats", "split", "rename") order by txid asc;

update tax_lots set amount=-amount where knwst_action="sell short";
-- manually fix acats, split, rename

-- insert actions - SIGH we need ONE ROW PER LOCATE time for google sheets processing
truncate table journals_asset;
alter table journals_asset auto_increment 0;
-- https://docs.google.com/spreadsheets/d/1kF0MDG3yvkgeV-QmsvSqRIEm0aVGxXd0kMVNL6DpS1c/edit?gid=1642962487#gid=1642962487

-- below is wrong

-- insert into journals_asset (knwst_txid,created,updated,dphys,price_com,comm1_com,knwst_brokerage,knwst_locate,knwst_special,comment_com,confirm_com, knwst_action, knwst_action_num)
-- select * from (
  -- -- singles
  -- select txid,created,updated,`date`,price_comment,comm_comment,brokerage,locate,special,note_comment,confirm_comment, action, NULL as z
  -- from temp_txs where action in ("buy", "sell short", "buy close", "sell")
  -- -- doubles
  -- union all
  -- select txid,created,updated,`date`,price_comment,comm_comment,brokerage,locate,special,note_comment,confirm_comment, action, 0 as z
  -- from temp_txs where action in ("acats", "split", "rename")
  -- union all
  -- select txid,created,updated,`date`,price_comment,comm_comment,brokerage,locate,special,note_comment,confirm_comment, action, 1 as z
  -- from temp_txs where action in ("acats", "split", "rename")
-- ) x order by x.txid asc, x.z asc;

-- update journals_asset set direction=0 where knwst_action in ("buy", "sell short");
-- update journals_asset set direction=1 where knwst_action in ("buy close", "sell");
-- update journals_asset set direction=-knwst_action_num where knwst_action_num is not null;

-- fill in other fields after google sheets
-- update journals_asset as ja, temp_txs as t set ja.created=t.created, ja.updated=t.updated, ja.dphys=t.date, ja.price_com=t.price_comment, ja.comm1_com=t.comm_comment, ja.knwst_brokerage=t.brokerage, ja.knwst_special=t.special, ja.comment_com=t.note_comment, ja.confirm_com=t.confirm_comment, ja.knwst_action=t.action where ja.knwst_txid=t.txid;

-- ,knwst_special,comment_com,confirm_com, knwst_action, knwst_action_num)
-- ,special,note_comment,confirm_comment, action, NULL as z

-- ARGH THIS IS ALSO WRONG TIME TO GIVE UP

-- cleanup

-- update journals_asset set txid=(select txid from transactions where transactions.knwst_txid=journals_asset.knwst_txid);


-- rest are journals_asset




-----------------------

-- consolidate and double check cash accounts

-- these journals are going to be axed, they repeat something in knwst
select journals_cash.* from journals_cash left join accounts on accounts.acctid=journals_cash.acctid where knwst_txid is null and temp_market_acct order by d desc;

insert into accounts (acctid, name, sort, internal, revenue, nw_include, taxable, comment_com, temp_market_acct)
select acctid+90000, concat("[FF] ", name), null, internal, revenue, 0, taxable, comment_com, temp_market_acct from accounts where temp_market_acct;

update journals_cash set acctid=acctid+90000 where jcid in (select jcid from journals_cash left join accounts on accounts.acctid=journals_cash.acctid where knwst_txid is null and temp_market_acct);

select name, sum(amount) from journals_cash left join accounts on accounts.acctid=journals_cash.acctid
where temp_market_acct group by name;
