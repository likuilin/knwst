const {Temporal} = require("temporal-polyfill");
const BigNumber = require('bignumber.js');

const {db} = require("./db.js");
const {redis} = require("./redis.js");

// returns whether another call would be fruitful - new std if so
const step = async (output=true, memo={}) => {
  // logging
  if (output) await redis.del("step-out");
  const log = msg => {
    if (!output) return;
    // console.log(msg);
    // intentionally dropped promise
    redis.lpush("step-out", msg);
  };

  // figure out what day this step is
  let today_t, yesterday_t;
  {
    const synced = await redis.get("synced-to-date");
    if (!synced) {
      const r = await db.query("select d from transactions order by d asc limit 1;");
      if (r.length === 0) {
        log("No transactions in the transactions table.");
        return false;
      }

      const d = r[0].d;
      await redis.set("first-day", d);
      yesterday_t = null;
      today_t = Temporal.PlainDate.from(d);
    } else {
      yesterday_t = Temporal.PlainDate.from(synced);
      today_t = yesterday_t.add({days: 1});
    }
  }
  const today = today_t.toString();
  log("Starting step for " + today);

  // reset stuff
  await redis.del(["warnings", "day-" + today]);

  // warnings
  const warnings = [];
  const warnings_ack = new Set((await db.query("select warning from warnings_ack where d=?", [today])).map(e => e.warning));
  const warn = w => {
    log("WARN: " + w);
    if (warnings_ack.has(w)) warnings_ack.delete(w);
    else warnings.push(w);
  };

  // running data points from previous day - note that only internal accts are tracked here
  // this means that, yes, the balance for external accts cannot be graphed
  const acctbal = {}, budgetbal = {};
  if (!memo.accts) memo.accts = await db.query("select acctid from accounts where internal=1");
  if (!memo.budgets) memo.budgets = await db.query("select budgetid from budgets");
  const {accts, budgets} = memo;
  if (yesterday_t) {
    for ({acctid} of accts) acctbal[acctid] = new BigNumber(await redis.hget("day-" + yesterday_t.toString(), "acct-" + acctid));
    for ({budgetid} of budgets) budgetbal[budgetid] = new BigNumber(await redis.hget("day-" + yesterday_t.toString(), "budget-" + budgetid));
  } else {
    log("Initialized accounts for first day");
    for ({acctid} of accts) acctbal[acctid] = new BigNumber(0);
    for ({budgetid} of budgets) budgetbal[budgetid] = new BigNumber(0);
  }

  // main loop
  const txs = await db.query("select * from transactions where d=? order by txid asc", [today]);
  for (const {txid, title_com, completed} of txs) {
    log("\n=== txid " + txid + ": " + title_com);
    const jcs = await db.query("select * from journals_cash where txid=? order by jcid asc", [txid]);
    for (let {jcid, acctid, amount, comment_com} of jcs) {
      log("jcid " + jcid + ": " + comment_com);

      amount = new BigNumber(amount);
      if (!amount.isFinite()) {
        amount = new BigNumber(0);
        warn("jcid " + jcid + ": amount is not finite");
      }

      if (acctbal.hasOwnProperty(acctid)) acctbal[acctid] = acctbal[acctid].plus(amount);
    }
  }

  // if there are any unmatched or extra warnings, halt
  if (warnings.length > 0 || warnings_ack.size > 0) {
    log("Warnings mismatch!");
    await redis.lpush("warnings", warnings.concat([...warnings_ack].map(e=>"Unmatched acked warning: " + e)));
    return false;
  }

  // success! save stuff
  log("Step success!");
  for ({acctid} of accts) await redis.hset("day-" + today, "acct-" + acctid, acctbal[acctid].toString());
  for ({budgetid} of budgets) budgetbal[budgetid] = await redis.hset("day-" + today, "budget-" + budgetid, budgetbal[budgetid].toString());
  await redis.set("synced-to-date", today);
  return today_t;
};

const multiStep = async (output=true) => {
  // allow user stop
  await redis.set("multistep-run", "1");

  try {
    // grab the last day to know where to stop
    const r = await db.query("select d from transactions order by d desc limit 1;");
    if (r.length === 0) return await step(output); // passthrough output logging logic for no txs
    const lastDay = Temporal.PlainDate.from(r[0].d);

    // do the loop
    // todo: if step is good about not letting failed attempts mess stuff up, we could run it with output=false until it fails, then run once with output=true to get output, if this needs to be faster
    const memo = {};
    while (await redis.get("multistep-run")) {
      const std = await step(output, memo);
      if (!std || Temporal.PlainDate.compare(std, lastDay) === 1) break;
    }
  } catch (e) {
    console.error(e);
    await redis.lpush("step-out", "multistep error: " + e.toString());
  } finally {
    await redis.del("multistep-run");
  }
};

module.exports = {step, multiStep};
