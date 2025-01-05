const mariadb = require('mariadb');
const {db} = require("./db.js");

(async () => {
  let txid = 0, jcid=0;
  for (const {date, description, amount, acct} of await db.query(`select * from import_pre_fftxs`)) {
    // await db.batch("insert into fftxs (date, amount, brokerage) values (?, ?, ?)", fftxs.map(({date, net, brokerage}) => [date, net, brokerage]));
    /*
    Chase Brokerage
  Chase Checking
  Chase Savings
    */
    let a;
    if (acct === "Chase Brokerage") a = "Chase Investment 2746";
    else if (acct === "Chase Checking") a = "Chase Total Checking 2931";
    else if (acct === "Chase Savings") a = "Chase Savings 6736";
    else throw new Error("?");

    await db.query(`insert into transactions(txid, acct, d, title_com, category, comment_com) values (?, ?, ?, ?, '', '')`, [txid, a, date, description]);
    await db.query(`insert into journals_cash(jcid, txid, acct, dpost, amount) values (?, ?, ?, ?, ?)`, [jcid++, txid, a, date, amount]);
    await db.query(`insert into journals_cash(jcid, txid, acct, dpost, amount) values (?, ?, 'TODO', ?, ?)`, [jcid++, txid, date, -amount]);
    txid++;
  }

  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
