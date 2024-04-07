const mariadb = require('mariadb');
const {db} = require("../db.js");
const {goBack, fixToS, sToFix} = require("../helpers.js");

const yf = require('yahoo-finance2').default;

module.exports = async (req, res) => {
  let out = "";

  // connect to firefly db and pull totals
  let fftxs = [];
  {
    const ff = await mariadb.createConnection({
       host: 'fireflydb', 
       database: 'firefly', 
       user: 'firefly', 
       password: 'secret_firefly_password'
    });
    fftxs = await ff.query(`
      select date(date) as date, sum(amount) as net,
          transaction_journal_id in (
            select transaction_journal_id from tag_transaction_journal where tag_id=100 /*Market tag, yours will differ*/
          ) as market
        from transactions
          left join transaction_journals on transaction_journals.id=transactions.transaction_journal_id
        where account_id in (
          select id from accounts where
            account_type_id not in
              (4 /*expense*/, 5 /*revenue*/, 6 /*initial balance*/)
            and deleted_at is null
        ) and transactions.deleted_at is null group by date, market order by date asc;
    `);
    ff.close();
  }

  // fftxs table isn't used for anything by the way - could just get rid of it
  await db.query("truncate table fftxs;");
  await db.batch("insert into fftxs (date, amount, market) values (?, ?, ?)", fftxs.map(({date, net, market}) => [date, net, market]));

  out += "Imported from Firefly " + fftxs.length + " data points from " + fftxs[0].date.toISOString().split("T")[0] + " to " + fftxs[fftxs.length-1].date.toISOString().split("T")[0] + "\n\n";
  out += "Total non-market: " + fftxs.filter(e=>!e.market).reduce((a, e) => a+(+e.net), 0).toFixed(4) + "\n";
  out += "Total value (nw): " + fftxs.reduce((a, e) => a+(+e.net), 0).toFixed(4) + "\n\n";

  // truncate output tables
  await db.query("truncate table out_graph;");
  await db.query("truncate table out_holdings;");
  await db.query("truncate table out_realized;");

  // grab stock txs
  const txs = await db.query("select * from txs order by date asc;");

  // date helper
  const addDate = (date, days=1) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  };

  // prepare yahoo finance stuff
  // if it's a new day, stuff will be redownloaded anyways, but for old assets:
  const REDOWNLOAD_PRICES = false;
  // alas these are lost to the sands of time (slash my lazinesS)
  const TICKER_BLACKLIST = ["BBBY230120C00080000","BB230303C00004000","DWAC240328C00060000","DWAC240322C00060000","DJI240328C00060000","DJI240328C00080000","DJI240328C00070000","HOOD240328C00019500"];
  // if true, the yfdata table is to cache values /in case/ they change or disappear, and as a cache
  const today = (new Date()).toISOString().split("T")[0];
  const yf_downloaded = {};
  const yf_cache = {};
  const yf_add = [];
  for (const {ticker, date, close} of await db.query("select ticker, date, close from yfdata")) {
    if (!yf_cache.hasOwnProperty(ticker)) yf_cache[ticker] = {};
    yf_cache[ticker][date.toISOString().split("T")[0]] = close;
  }
  const yf_get = async (ticker, date) => { // note: assumes first call has earliest date for any given ticker
    if (TICKER_BLACKLIST.includes(ticker)) return 0n;

    // check backwards by a week
    date_start = addDate(date, -7);

    // if downloaded already, use that
    if (yf_downloaded[ticker] || (!REDOWNLOAD_PRICES && yf_cache[ticker])) {
      // lookback up to a week
      for (let d=date; d >= date_start; d=addDate(d, -1)) {
        const ds = d.toISOString().split("T")[0];
        if (yf_cache[ticker][ds]) return sToFix(yf_cache[ticker][ds], 4);
      }
      // not found :( if this was opportunistic, maybe it's more recent than what we have
      if (yf_downloaded[ticker]) return 0n;
    }

    // otherwise try to download
    let dl;
    try {
      console.log("Downloading", ticker, date_start);
      dl = (await yf.chart(ticker, {period1: date_start, events: ""})).quotes;
      yf_downloaded[ticker] = true;
    } catch (e) {
      if (yf_cache[ticker]) {
        console.log("Using cached:", ticker, date);
        yf_downloaded[ticker] = true;
        return await yf_get(ticker, date);
      } else {
        console.log("Could not download and have no history, assuming zero price:", ticker, date);
        yf_downloaded[ticker] = true;
        yf_cache[ticker] = {};
        return 0n;
      }
    }

    // put the prices in and alert if there's a difference
    if (!yf_cache[ticker]) yf_cache[ticker] = {};
    for (const {date: pdate_f, close: close_f} of dl) {
      if (close_f === null) continue;
      const pdate = pdate_f.toISOString().split("T")[0];
      const close = fixToS(BigInt(Math.round(close_f*100))*100n, 4);
      
      if (yf_cache[ticker][pdate]) {
        if (yf_cache[ticker][pdate] !== close) {
          throw new Error("Cached price does not match ticker for " + ticker + " " + pdate + ": yahoo=" + close_f + "; saved=" + yf_cache[ticker][pdate]);
        }
      } else {
        yf_cache[ticker][pdate] = close;
        // do not add price if pdate is today since it fluctuates for crypto
        if (pdate !== today) yf_add.push([ticker, pdate, close]);
      }
    }
    
    return await yf_get(ticker, date);
  }

  /*
    note: brokerage cash balances are only tracked as a checksum!
    a transfer of existing money into a brokerage account is not tagged in firefly as Market and does not change my net worth
    so those dollars will be in ff_no_market
    same as interest and dividends, counterintuitively, because those are not reflected in the asset price because we use the non-adjusted yf closing price
  */

  // do the stuff
  const graph = []; // {date, ff_no_market, ff_market, yf_market, yf_invested_index, yf_invested_spec}
  let ff_no_market=0n, ff_market=0n;
  const holdings = []; // {brokerage, ttype, ticker, txids, shorted, open_date, amount, basis}
  const holdings_cash = {}; // {[brokerage]: cash} - ONLY as a checksum for the cash holdings entry
  const closed_pnl = {}; // {[brokerage]: cash} - total realized pnl, unrealized is in holdings
  const realized = []; // {brokerage, ttype, ticker, txids, acquire_date, dispose_date, amount, basis, proceeds}

  /*
    sigh, disallowed brokerages - for these "brokerages":
    * there are no firefly Market transactions
    * this tool only is used for tax reporting
    * for this tool, the entire amount is a non-market loss until realized, so, no price tracking
  */
  const brokerages_skipped = ["Defi"]; // todo not hardcode this, or, better yet, fix the aave edge case lol

  // note - timezones might mess with the date calculations, both databases return date() so it should have zero time
  // but the databases may have different timezones, good luck!

  const now = new Date();
  let fftxi = 0; txi = 0;
  for (let date=new Date(Math.min(fftxs[0].date, txs[0].date)); date<now; date=addDate(date)) {
    for (;fftxi < fftxs.length && fftxs[fftxi].date <= date; fftxi++) {
      if (fftxs[fftxi].date - date !== 0) throw new Error();
      const {net, market} = fftxs[fftxi];
      let ffnet = sToFix(net, 24)/(10n**20n);
      if (market) ff_market += ffnet;
      else ff_no_market += ffnet;
    }
    for (;txi < txs.length && txs[txi].date <= date; txi++) {
      if (txs[txi].date - date !== 0) throw new Error();
      let {txid, ttype, ticker, action, amount, net, brokerage, locate, locate_basis, custom} = txs[txi];
      if (amount !== null && amount.startsWith("-")) throw new Error();
      if (brokerage && !holdings_cash[brokerage]) {
        holdings_cash[brokerage] = 0n;
        closed_pnl[brokerage] = 0n;
      }
      
      // === tx processing ===
      // actions: ["sell", "buy close", "acats", "split", "dividend", "rename", "ext trans", "interest"]

      if (action === "transfer" || action === "dividend" || action === "interest") { // cash effect only
        holdings_cash[brokerage] += sToFix(net);
      } else if (action === "buy" || action === "short sell") { // open new position
        const netB = sToFix(net);
        const shorted = action === "short sell";
        holdings.push({brokerage, ttype, ticker, txids: txid.toString(), shorted, open_date: date, amount, basis: fixToS(-netB)});
        holdings_cash[brokerage] += netB;
      } else if (action === "sell" || action === "buy close" || action === "acats" || action === "split" || action === "rename") {
        // all the actions that require locating existing matching shares using (brokerage, ticker) or locate
        // sells are manually split if they need multiple locates because who knows how the basis is split otherwise, can't specify with just one number sadly

        // locate it
        let i = 0;
        if (locate !== null) {
          // lol
          if (locate === "") throw new Error();

          // specified one
          for (; i<holdings.length; i++) if (holdings[i].txids === locate) break;
        } else {
          // find first matching one
          for (; i<holdings.length; i++) if (holdings[i].brokerage === brokerage && holdings[i].ticker === ticker) break;
        }
        if (i == holdings.length) throw new Error(txid);

        // then do the rest
        if (action === "sell" || action === "buy close") {
          const netB = sToFix(net);

          // find basis
          if (holdings[i].amount === amount) {
            // closes all of it, so locate_basis is optional
            if (locate_basis !== null && locate_basis !== holdings[i].basis) throw new Error(txid + " " + locate_basis + " " + holdings[i].basis);
            locate_basis = holdings[i].basis;
          } else {
            // locate_basis is required because different brokerages pro rata the commission in different ways
            if (!locate_basis) throw new Error(txid);
          }

          // add our tx to the txids
          holdings[i].txids += "," + txid;

          // now depends on short or not
          if (action === "sell") {
            realized.push({
              brokerage, ttype, ticker, txids: holdings[i].txids,
              acquire_date: holdings[i].open_date, dispose_date: date,
              amount, basis: locate_basis, proceeds: net
            });
          } else { // buy close
            realized.push({
              brokerage, ttype, ticker, txids: holdings[i].txids,
              acquire_date: date, dispose_date: date,
              // "basis" is the credit we got for the initial short sale, so negative that is proceeds of the close
              // basis of the close is cash used to repurchase share, so -netB
              amount, basis: fixToS(-netB), proceeds: fixToS(-sToFix(locate_basis))
            });
          }
          closed_pnl[brokerage] += netB - sToFix(locate_basis);

          // adjust holding
          {
            const _amount = sToFix(holdings[i].amount, 18) - sToFix(amount, 18);
            if (_amount < 0n) throw new Error(txid);
            holdings[i].amount = fixToS(_amount, 18);
            const _basis = sToFix(holdings[i].basis) - sToFix(locate_basis);
            if (_basis < 0n) throw new Error(txid);
            holdings[i].basis = fixToS(_basis);

            // remove if it's zero
            if (_amount === 0n && _basis === 0n) holdings.splice(i, 1);
          }

          // cash balance
          holdings_cash[brokerage] += netB;
        } else if (action === "acats" || action === "split" || action === "rename") {
          if (!custom.startsWith(action + " ")) throw new Error(txid);
          if (holdings[i].amount !== amount) throw new Error(txid);
          custom = custom.substr(action.length + 1);

          if (action === "acats")
            holdings[i].brokerage = custom;
          else if (action === "split")
            holdings[i].amount = fixToS(sToFix(holdings[i].amount, 18)*BigInt(custom), 18);
          else if (action === "rename")
            holdings[i].ticker = custom;
          
          // annotate txids
          holdings[i].txids += "," + txid;
        } else throw new Error(action);
      } else throw new Error(action);
    }

    // calculate asset worth based on holdings using yf data
    // in interim, yf_market has 18+4 zeroes because amount has 18 zeroes
    let yf_market = 0n;
    let yf_invested_index = 0n;
    let yf_invested_spec = 0n;
    for (const h of holdings) {
      const {brokerage, ttype, ticker, shorted, amount, basis} = h;
      let v = await yf_get(ticker, date);
      if (ttype === "option") v *= 100n;
      if (shorted) v = -v;
      v = (v * sToFix(amount, 18))/(10n**18n);
      h.value = fixToS(v)
      if (!brokerages_skipped.includes(brokerage)) {
        yf_market += v - sToFix(basis);
        if (ttype === "index") yf_invested_index += v;
        else yf_invested_spec += v;
      }
    }
    for (const b of Object.keys(closed_pnl)) {
      if (brokerages_skipped.includes(b)) continue;
      yf_market += closed_pnl[b];
    }

    graph.push({date, ff_no_market: fixToS(ff_no_market), ff_market: fixToS(ff_market), yf_market: fixToS(yf_market), yf_invested_index: fixToS(yf_invested_index), yf_invested_spec: fixToS(yf_invested_spec)});
  }

  await db.batch("insert into out_graph (date, ff_no_market, ff_market, yf_market, yf_invested_index, yf_invested_spec) values (?, ?, ?, ?, ?, ?)",
    graph.map(({date, ff_no_market, ff_market, yf_market, yf_invested_index, yf_invested_spec}) => [date, ff_no_market, ff_market, yf_market, yf_invested_index, yf_invested_spec]));
  await db.batch("insert into out_holdings (brokerage, ttype, ticker, txids, shorted, open_date, amount, basis, value) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    holdings.map(({brokerage, ttype, ticker, txids, shorted, open_date, amount, basis, value}) => [brokerage, ttype, ticker, txids, shorted, open_date, amount, basis, value || null])
    .concat(Object.keys(holdings_cash).map(brokerage => [brokerage, 'cash', '==CASH==', '', 0, null, fixToS(holdings_cash[brokerage]), 0, null])));
  await db.batch("insert into out_realized (brokerage, ttype, ticker, txids, acquire_date, dispose_date, amount, basis, proceeds) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    realized.map(({brokerage, ttype, ticker, txids, acquire_date, dispose_date, amount, basis, proceeds}) => [brokerage, ttype, ticker, txids, acquire_date, dispose_date, amount, basis, proceeds]));

  // save yf data
  if (yf_add.length) await db.batch("insert into yfdata (ticker, date, close) values (?, ?, ?)", yf_add);

  return res.send('<pre>' + out + '</pre><br /><a href="/">Back</a>');
};
