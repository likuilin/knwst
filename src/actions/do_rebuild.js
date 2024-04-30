const mariadb = require('mariadb');
const {db} = require("../db.js");
const {goBack, fixToS, sToFix, addDate, bnMin} = require("../helpers.js");

const yf = require('yahoo-finance2').default;

module.exports = async (req, res) => {
  let out = "";

  // firefly and pre-firefly transactions
  // latter will be sorta hacky
  let fftxs = [];

  // == grab preff_txs and checksum ==
  fftxs = await db.query('select date, sum(amount) as net, acct="Chase Brokerage" as brokerage from pre_fftxs group by date, brokerage order by date asc;');

  // == connect to firefly db and pull fftxs ==
  {
    const ff = await mariadb.createConnection({
       host: 'fireflydb', 
       database: 'firefly', 
       user: 'firefly', 
       password: 'secret_firefly_password'
    });
    let fftxs_db = await ff.query(`
      select date(date) as date, round(sum(amount), 4) as net,
          account_id in (select account_id from account_meta where name="account_role" and data='"sharedAsset"') as brokerage
        from transactions
          left join transaction_journals on transaction_journals.id=transactions.transaction_journal_id
        where account_id in (
          select id from accounts where
            account_type_id not in
              (4 /*expense*/, 5 /*revenue*/, 6 /*initial balance*/)
            and id not in (select account_id from account_meta where name="include_net_worth" and data='"0"')
            and deleted_at is null
        ) and transactions.deleted_at is null group by date, brokerage order by date asc, brokerage asc;
    `);
    ff.close();
    
    fftxs_db = fftxs_db.map(({date, net, brokerage}) => ({date, net, brokerage}));

    // check initial deposits with pre_fftxs data
    const ff_transition_date = fftxs[fftxs.length-1].date;
    const totals = [0n, 0n];
    for (const {net, brokerage} of fftxs) totals[+brokerage] += sToFix(net);
    // first tx is non-brokerage, must match, will be deleted
    if (+fftxs_db[0].date !== +ff_transition_date || sToFix(fftxs_db[0].net) !== totals[0] || fftxs_db[0].brokerage !== 0) throw new Error();
    // second tx is brokerage, difference is added as one tx
    if (+fftxs_db[1].date !== +ff_transition_date || fftxs_db[1].brokerage !== 1) throw new Error();
    fftxs_db[1].net = fixToS(sToFix(fftxs_db[1].net) - totals[1]);

    // add rest to fftxs
    fftxs = fftxs.concat(fftxs_db.slice(1));
  }

  // fftxs table isn't used for anything by the way - could just get rid of it
  await db.query("truncate table fftxs;");
  await db.batch("insert into fftxs (date, amount, brokerage) values (?, ?, ?)", fftxs.map(({date, net, brokerage}) => [date, net, brokerage]));

  // == truncate output tables ==
  await db.query("truncate table out_graph;");
  await db.query("truncate table out_holdings;");
  await db.query("truncate table out_realized;");

  // == grab input data ==
  await db.query('update txs set updated=updated, locate=replace(locate, "\\r\\n", "\\n")'); // sigh lol
  const txs = await db.query("select * from txs order by date asc, txid asc;");

  // == ticker getter ==
  let getTicker;
  {
    const tickers = Object.fromEntries((await db.query("select ticker, ticker_type, price_override, exposure_type, exposure_factor, allocation_index from tickers"))
      .map(({ticker, ...rest}) => [ticker, rest]));

    getTicker = async ticker => {
      if (!tickers[ticker]) {
        const ticker_type = ticker.match(/^[A-Z]+\d{6}[PC]\d{8}$/) ? "option" : "stock";
        tickers[ticker] = (await db.query("insert into tickers(ticker, ticker_type) values (?, ?) returning *;", [ticker, ticker_type]))[0];
        // note: tickers[ticker].ticker exists for these but not the ones above
      }
      
      const {ticker_type, price_override, exposure_type, exposure_factor, allocation_index} = tickers[ticker];
      return ({
        ticker_type, price_override: price_override && sToFix(price_override),
          exposure_type, exposure_factor: BigInt(exposure_factor), allocation_index
      });
    };
  }

  // == brokerages table ==
  await db.query("update brokerages set out_cash=null;");
  const brokerages = Object.fromEntries((await db.query("select brokerage, nw_include, taxable from brokerages"))
    .map(({brokerage, nw_include, taxable}) => [brokerage, {nw_include, taxable, out_cash: 0n}]));

  // == yahoo finance stuff ==
  const today = new Date(new Date().toLocaleDateString("en-US", {timeZone: 'America/New_York'}));
  if (!today.toISOString().endsWith('T00:00:00.000Z')) throw new Error("Local time not UTC"); // sorry - don't wanna check if {mariadb lib, yahoo finance historical endpoint, ...} returns zero local or UTC time

  // switch for redownloading all prices even if we don't need them
  // if it's a new day, stuff from last cached to today will be redownloaded anyways for current holdings
  // but for past holdings this could be a lot of calls
  const REDOWNLOAD_PRICES = false;

  const yf_downloaded = {}; // bool, downloaded this run
  const yf_cache = {}; // prices by ticker and date (num)
  const yf_add = []; // to add to db for next time
  for (const {ticker, date, close, implied} of await db.query("select ticker, date, close, implied from yfdata")) {
    if (!yf_cache.hasOwnProperty(ticker)) yf_cache[ticker] = {};
    yf_cache[ticker][+date] = {price: sToFix(close, 18), implied: !!implied};
  }

  const yf_get = async (ticker, date) => {
    if (!yf_cache.hasOwnProperty(ticker)) yf_cache[ticker] = {};

    // if we already have the data then use it
    if (yf_downloaded[ticker] || (!REDOWNLOAD_PRICES && yf_cache[ticker][+date])) {
      if (!yf_cache[ticker][+date]) return 0n; // before first data point
      return yf_cache[ticker][+date].price;
    }

    // time to download the data, check tickers first for a price override
    const {price_override} = await getTicker(ticker);
    if (price_override !== null) return price_override;

    // fetch from yahoo starting backwards by a week
    const dl_date = addDate(date, -7);

    let dl;
    try {
      console.log("Downloading", ticker, dl_date);
      dl = await yf.historical(ticker, {period1: dl_date, events: ""});
      console.log(" - Downloaded", dl.length, dl[0].date.toISOString().split("T")[0], dl[dl.length-1].date.toISOString().split("T")[0])
      yf_downloaded[ticker] = true;
    } catch (e) {
      if (yf_cache[ticker]) {
        console.log(" - Download error, using cached as fallback");
        yf_downloaded[ticker] = true;
        return await yf_get(ticker, date);
      } else {
        throw new Error("Could not download and have no history for " + ticker + " " + date);
      }
    }

    // go day by day to add implied prices
    if (!dl.length) throw new Error("Zero downloaded for " + ticker + " " + date);
    if (!yf_cache[ticker]) yf_cache[ticker] = {};
    let price = 0n; // last price
    for (let d=dl[0].date, i=0; +d <= +today; d=addDate(d, 1)) {
      let implied;
      if (i < dl.length && +dl[i].date === +d) {
        // has price for date
        // close is a js float, sigh, let's just assume toString doesn't make it scientific notation
        const [a, b=""] = dl[i].close.toString().split(".");
        if (b.length > 18) throw new Error("todo");
        price = sToFix(a + "." + b.padEnd(18, "0"), 18);
        implied = false;
        i++;
      } else if (i >= dl.length || +dl[i].date > +d) {
        // next priced day is in the future or we ran out of dates, use implied price for today
        implied = true;
      } else throw new Error("Yahoo dates are not strictly increasing?");

      if (price === 0n) throw new Error("Zero price");
      if (!yf_cache[ticker][+d]) {
        // only save if it's not today or yesterday (24h tickers)
        // TODO figure this out, when do prices change?
        yf_add.push([ticker, d, fixToS(price, 18), implied]);
        yf_cache[ticker][+d] = {price, implied};
      } else if (yf_cache[ticker][+d].price !== price) {
        // price mismatch!
        if (yf_cache[ticker][+d].implied) {
          // if the old price was implied, then that's fine, just replace it
          if (+d !== +today) yf_add.push([ticker, d, fixToS(price, 18), implied]);
          yf_cache[ticker][+d] = {price, implied};
        } else {
          // otherwise uh, oh no
          /*
          throw new Error("Downloaded price does not match cached price for " + ticker + " " + d.toISOString().split("T")[0] + "." +
            " / Cached: " + fixToS(yf_cache[ticker][+d].price, 18, true) + " implied=" + yf_cache[ticker][+d].implied +
            " / Downloaded: " + fixToS(price, 18, true) + " implied=" + implied);
          */
          out += "Downloaded price does not match cached price for " + ticker + " " + d.toISOString().split("T")[0] + "." +
            " / Cached: " + fixToS(yf_cache[ticker][+d].price, 18, true) + " implied=" + yf_cache[ticker][+d].implied +
            " / Downloaded: " + fixToS(price, 18, true) + " implied=" + implied + "\n";
          return price;
        }
      }
    }

    // exit and rerun since now the price should be in the cache
    return await yf_get(ticker, date);
  }

  // hardcoded exposure categories, this is a total mess
  const exposure_cats = ["spec", "total", "exus", "us", "bond"];

  // do the stuff
  const graph = [];
  const graph_ff = {ff_nonbrokerage: 0n, ff_brokerage: 0n}; // will be added to out_graph columns later
  const graph_headers = [
    "ff_nonbrokerage", "ff_brokerage",
    "nw_alloc_cash", "nw_alloc_index", "nw_alloc_nonindex",
    ...exposure_cats.map(e => "nw_exposure_" + e)
  ];
  let holding_id = 0;
  const holdings = []; // {id, brokerage, ticker, shorted, open_date, amount, basis, notes}
  const realized = []; // {id, brokerage, ticker, acquire_date, dispose_date, amount, basis, notes, proceeds}

  let fftxi = 0; txi = 0;
  for (let date=new Date(Math.min(fftxs[0].date, txs[0].date)); date<=today; date=addDate(date)) {
    const date_str = date.toISOString().split("T")[0];

    // process fftxs until we are done with today
    for (;fftxi < fftxs.length && +fftxs[fftxi].date <= +date; fftxi++) {
      if (fftxs[fftxi].date - date !== 0) throw new Error();
      const {net, brokerage} = fftxs[fftxi];
      if (brokerage) graph_ff.ff_brokerage += sToFix(net);
      else graph_ff.ff_nonbrokerage += sToFix(net);
    }

    // process txs until we are done with today
    for (;txi < txs.length && +txs[txi].date <= +date; txi++) {
      if (txs[txi].date - date !== 0) throw new Error();

      if (true && txs[txi].txid >= 3489) {
        // debug: print all holdings
        console.log("=== holdings at txid #" + txs[txi].txid + " ===");
        console.log("id, brokerage, ticker, shorted, open_date, amount, basis".split(", ").join("\t"));
        for (const {id, brokerage, ticker, shorted, open_date, amount, basis} of holdings) {
          console.log([id, brokerage, ticker, shorted ? "S" : "L", open_date.toISOString().split("T")[0], amount, basis].join("\t"));
        }
      }

      let {txid, ticker, action, amount, net, brokerage, locate, special} = txs[txi];
      net = net === null ? NaN : sToFix(net);
      if (amount === null) amount = NaN;
      else {
        if (amount.startsWith("-")) throw new Error(txid + " Negative amount");
        amount = sToFix(amount, 18);
      }

      // === tx processing ===
      /*
          actions:
          transfer, dividend, interest,
          buy, sell short,
          sell, buy close,
          acats, rename, split,
          exercise, assign
      */

      if (action === "transfer" || action === "dividend" || action === "interest") { // cash effect only
        /*
          note: currently we don't do anything special with external transfers
          this is because the only source of data for non-brokerage accounts is firefly
          so the difference between an external and internal into-brokerage-account transfer is equal to an external transfer into a non-brokerage account
          and normal external transfers into non-brokerage accounts are not something knwst sees at all
          --
          this is weird, but, sadly, this data cannot really be audited
          --
          maybe someday this loop will track the sum of non-brokerage accounts?
          we would have to pull from firefly non-brokerage inflow and outflow though, or have manual logging of that here as well (ugh no)
          and so the only thing that would be verified that way is that firefly adds stuff properly
          and like, the adding is actually done on this side lol
          --
          so yea i can't see that happening EXCEPT if one day i'm like, let's not use firefly AT ALL
          totally possible, but, not now
        */

        if (!(action === "transfer" && special === "transfer external"))
          if (special !== "") throw new Error(txid + " Unexpected special");
        if (locate !== "") throw new Error(txid + " Unexpected locate");

        brokerages[brokerage].out_cash += net;
      } else if (action === "buy" || action === "sell short") { // open new position
        // NOTE: if this is modified, also see open position in options exercise/assignment
        if (special !== "") throw new Error(txid + " Unexpected special");
        if (locate !== "") throw new Error(txid + " Unexpected locate");
        holdings.push({
          id: holding_id++, brokerage, ticker,
          notes: date_str + ' #' + txid + " " + action + " " + fixToS(amount, 18, true),
          shorted: action === "sell short", open_date: date, amount, basis: -net
        });
        brokerages[brokerage].out_cash += net;
      } else {
        // remaining actions all require identifying existing holdings and annihilating them
        // if locate isn't set, find it automatically
        // in this case the first holding must satisfy it completely, and have the exact same quantity
        // if multiple holdings are needed to satisfy it, then the breakdown must be declared because it is unknown
        // same if one holding is split to satisfy it, the breakdown is not known and depends on how the brokerage calculated it

        const locates = []; // same format as holdings PLUS netPart (part of net, or null if n/a (ex. acats)) PLUS special (false or string)
        // this is so bad - but the autofill stuff is temporary, until i clean up all the records by cross referencing with 1099s from 2015 to today
        let locate_generating = locate === "";
        if (locate_generating) locate = "AUTOFILL" + "\nauto auto auto auto".repeat(10);

        // for autofill, fill in locate back to txs db
        let locate_generated = [];
        let locate_generated_autofill = false;

        {
          let amountLeft = amount;
          let netLeft = net;
          let netNull = txs[txi].net === null; // net is set to NaN if it's null for safety
          // parse custom table thing, or generate
          for (const row of locate.split("\n")) {
            if (locate_generating && amountLeft === 0n) break;

            if (row === "GENERATED") continue;
            if (row === "AUTOFILL") {
              locate_generated_autofill = true;
              continue;
            }
            let [amt, basisClosed, netPart, id, special=false /* for options assign/exercise */] = row.split(" ");

            let i = id === "auto" ?
              holdings.findIndex(h => h.brokerage === brokerage && h.ticker === ticker) :
              holdings.findIndex(e => e.id === +id);
            if (i === -1) throw new Error(txid + " locate not found");
            if (holdings[i].brokerage !== brokerage || (!special && holdings[i].ticker !== ticker)) throw new Error(txid + " locate brokerage/ticker mismatch");

            amt = amt === "auto" ? bnMin(holdings[i].amount, amountLeft) : sToFix(amt, 18, true);
            // warning - auto splitting may split the net/basis differently than how a brokerage rounds the splitting of the net/basis!
            // only do this for stuff that doesn't report everything to the IRS so the numbers match up - if it reports, follow the numbers it reports
            // exception for if amt is all, then basisClosed=auto is safe, but netPart still should not be auto
            basisClosed = basisClosed === "auto" ? (holdings[i].basis * amt / holdings[i].amount) : sToFix(basisClosed, 4, true);
            if (netNull) {
              if (netPart !== "null" && netPart !== "auto") throw new Error(txid + " netpart not null for null net tx");
              netPart = null;
            } else {
              netPart = netPart === "auto" ? (netLeft * amt / amountLeft) : sToFix(netPart, 4, true);
            }

            if (!special) {
              locate_generated.push([fixToS(amt, 18, true), fixToS(basisClosed, 4), netPart === null ? "null" : fixToS(netPart, 4), holdings[i].id].join(" "));

              if (true) {
                // debug: specified basisClosed and netPart are close to auto basisClosed and netPart
                if (basisClosed !== holdings[i].basis * amt / holdings[i].amount)
                  console.log("Splitting audit", txid, "basisClosed", fixToS(basisClosed), fixToS(holdings[i].basis * amt / holdings[i].amount));
                if (!netNull && netPart !== netLeft * amt / amountLeft)
                  console.log("Splitting audit", txid, "netPart", fixToS(netPart), fixToS(netLeft * amt / amountLeft));
              }

              if (!netNull) netLeft -= netPart;
              amountLeft -= amt;
            }

            if (amt > holdings[i].amount) throw new Error(txid + " Locate too much amount");
            if (amt === holdings[i].amount) {
              // closes all, so we must check that no leftover basis exists
              if (basisClosed !== holdings[i].basis) throw new Error(txid + " Locate leftover basis");
              // then remove the entire position
              locates.push({...holdings.splice(i, 1)[0], netPart, special});
            } else {
              // closes some, so split the holding - new/old seem flipped here but when looking at a very split-from holding,
              // it makes more sense to imagine it is the original than the branches that left and immediately closed
              const new_id = holding_id++;

              // new holding has closed position, gets new id
              locates.push({...holdings[i], id: new_id, amount: amt, basis: basisClosed,
                notes: holdings[i].notes + '\n' + date_str + ' #' + txid + " split " + fixToS(amt, 18, true) +
                  " from lot " + holdings[i].id + " for " + action,
                netPart, special
              });

              // old holding has leftovers, keeps its id
              holdings[i].amount -= amt;
              holdings[i].basis -= basisClosed;
              holdings[i].notes += '\n' + date_str + ' #' + txid + " split away " + fixToS(amt, 18, true) +
                " to lot " + new_id + " for " + action + ", leftover " + fixToS(holdings[i].amount, 18, true);
            }
          }

          if (locate_generated_autofill) db.query("update txs set updated=updated, locate=? where txid=?;", ["GENERATED\n" + locate_generated.join("\n"), txid]);

          // ensure the tx amount equals locate amount sum
          if (amountLeft !== 0n) throw new Error(txid + " Locate amounts do not add up to tx amount");
          // ensure the tx net equals locate net sum
          if (!netNull && netLeft !== 0n) throw new Error(txid + " Locate net parts do not add up to tx net");
        }

        // then do the rest depending on action
        if (action === "sell" || action === "buy close") {
          // NOTE: if this is modified, also see open position in options exercise/assignment
          if (special !== "") throw new Error(txid + " Unexpected special");
          for (const l of locates) {
            if (l.special !== false) throw new Error(txid + " Unexpected special locate line");
            if (action === "sell") {
              if (l.shorted) throw new Error(txid + " Can't sell close short");
              realized.push({
                id: l.id, brokerage, ticker,
                acquire_date: l.open_date, dispose_date: date,
                amount: l.amount, basis: l.basis, proceeds: l.netPart,
                notes: l.notes + '\n' + date_str + ' #' + txid + " " + action
              });
            } else { // buy close only
              if (!l.shorted) throw new Error(txid + " Can't buy close long");
              realized.push({
                id: l.id, brokerage, ticker,
                acquire_date: date, dispose_date: date,
                // irs basis is the current net/proceeds, proceeds is the initial short sale credit
                amount: l.amount, basis: -l.netPart, proceeds: -l.basis,
                notes: l.notes + '\n' + date_str + ' #' + txid + " " + action
              });
            }
          }

          // cash balance
          brokerages[brokerage].out_cash += net;
        } else if (action === "acats" || action === "split" || action === "rename") { // adjustments
          if (!special.startsWith(action + " ")) throw new Error(txid);
          special = special.substr(action.length + 1);

          // all three of these require looping through locates and toss out netPart
          for (const {netPart, special: locate_special, ...l} of locates) {
            if (locate_special !== false) throw new Error(txid + " Unexpected special locate line");
            if (action === "acats") {
              l.notes += '\n' + date_str + ' #' + txid + " in-kind transfer to " + special;
              l.brokerage = special;
            } else if (action === "split") {
              const factor = sToFix(special, 18, true);
              // basis is the same
              l.notes += '\n' + date_str + ' #' + txid + " stock split by " + special;
              l.amount = l.amount * factor / ((10n)**18n)
            } else if (action === "rename") {
              l.notes += '\n' + date_str + ' #' + txid + " renamed to " + special;
              l.ticker = special;
            }

            holdings.push(l);
          }
        } else if (action === "exercise" || action === "assign") { // options
          let [act, action_underlying, b, ticker_underlying] = special.split(" ");
          if (act !== action) throw new Error(txid);
          action_underlying += " " + b; // buy open, sell open, buy close, sell close - checked later
          if (!ticker.startsWith(ticker_underlying)) throw new Error(txid);

          // separate out the underlying locates
          const locates_underlying = [];
          const locates_options = locates.filter(l => {
            if (l.special === false) return true;
            else if (l.special === "underlying") {
              locates_underlying.push(l);
              return false;
            } else throw new Error(txid + " Unexpected special in exercise/assign");
          });

          // calculate total adjustment to net (basis or proceeds) due to used options
          let net_total = net;
          let notes = date_str + ' #' + txid + " options " + action + " to " + action_underlying + " " + fixToS(amount*100n, 18, true) +
                "\n    total net is sum of:" +
                "\n      " + fixToS(net) + " net in cash";
          for (const {basis, amount, ticker} of locates_options) {
            net_total += -basis;
            notes += "\n      " + fixToS(-basis) + " used " + fixToS(amount, 18, true) + " contract " + ticker;
          }
          notes += "\n    = " + fixToS(net_total);

          // now it depends on open or close
          if (action_underlying === "buy open" || action_underlying === "sell open") {
            if (locates_underlying.length > 0) throw new Error(txid);

            // even if the options are multiple lots, we make one new lot of underlying
            holdings.push({
              id: holding_id++, brokerage, ticker: ticker_underlying,
              notes,
              shorted: action === "sell open", open_date: date, amount: amount*100n, basis: -net_total
            });
          } else if (action_underlying === "buy close" || action_underlying === "sell close") {
            // check the underlying locates, make sure they're okay
            {
              let netLeft = net_total;
              let amountLeft = amount * 100n;
              for (const l of locates_underlying) {
                if (l.brokerage !== brokerage) throw new Error(txid);
                if (l.ticker !== ticker_underlying) throw new Error(txid);
                if ((!l.shorted && action_underlying !== "sell close") || 
                     (l.shorted && action_underlying !== "buy close")) throw new Error(txid);
                netLeft -= l.netPart;
                amountLeft -= l.amount;
              }
              if (netLeft !== 0n) throw new Error(txid + " " + netLeft + " " + net_total);
              if (amountLeft !== 0n) throw new Error(txid);
            }

            // individually close each underlying lot
            for (const l of locates_underlying) {
              if (action_underlying === "sell close") {
                if (l.shorted) throw new Error(txid + " Can't sell close short");
                realized.push({
                  id: l.id, brokerage, ticker: l.ticker,
                  acquire_date: l.open_date, dispose_date: date,
                  amount: l.amount, basis: l.basis, proceeds: l.netPart,
                  notes: l.notes + '\n' + notes
                });
              } else { // buy close only
                if (!l.shorted) throw new Error(txid + " Can't buy close long");
                realized.push({
                  id: l.id, brokerage, ticker: l.ticker,
                  acquire_date: date, dispose_date: date,
                  // irs basis is the current net/proceeds, proceeds is the initial short sale credit
                  amount: l.amount, basis: -l.netPart, proceeds: -l.basis,
                  notes: l.notes + '\n' + notes
                });
              }
            }
          } else throw new Error(txid + " bad underlying action");

          brokerages[brokerage].out_cash += net;
        } else throw new Error(txid + " unknown action");
      }
    }

    // calculate asset worth based on holdings using yf data
    
    const graph_now = {...Object.fromEntries(graph_headers.map(e=>[e, 0n])), ...graph_ff};
    for (const h of holdings) h.cur_value = {}; //aaaaargh nooooooo this is horrifyingly bad
    for (const {brokerage, ticker, shorted, amount, cur_value} of holdings) {
      const t = await getTicker(ticker);
      let v = await yf_get(ticker, date); // 18 decimals
      if (t.ticker_type === "option") v *= 100n;
      if (shorted) v = -v;
      v = v * amount / (10n**32n); // 18+18-4 decimals
      cur_value.v = v;

      if (!brokerages[brokerage].nw_include) continue;

      if (t.allocation_index) graph_now.nw_alloc_index += v;
      else graph_now.nw_alloc_nonindex += v;

      graph_now["nw_exposure_" + t.exposure_type] += v*t.exposure_factor;
    }
    for (const b of Object.keys(brokerages)) {
      if (!brokerages[b].nw_include) continue;
      graph_now.nw_alloc_cash += brokerages[b].out_cash;
    }

    graph.push([date, ...graph_headers.map(k => fixToS(graph_now[k]))]);
  }

  {
    const [date, ff_nonbrokerage, ff_brokerage, nw_alloc_cash, nw_alloc_index, nw_alloc_nonindex, ..._] = graph[graph.length-1].map(e=>+e);
    out += "ff nw check: " + fftxs.reduce((a, e) => a+(+e.net), 0).toFixed(2) + "\n\n";
    out += "ff nw graph: " + (ff_nonbrokerage + ff_brokerage).toFixed(2) + "\n";
    out += "calculated:  " + (ff_nonbrokerage + nw_alloc_cash + nw_alloc_nonindex + nw_alloc_index).toFixed(2) + "\n\n";
  }

  await db.batch("insert into out_graph (date, " + graph_headers.join(", ") + ") values (?" + ", ?".repeat(graph_headers.length) + ")", graph);
  await db.batch("insert into out_holdings (id, brokerage, ticker, shorted, open_date, amount, basis, notes, cur_value) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    holdings.map(({id, brokerage, ticker, shorted, open_date, amount, basis, notes, cur_value}) =>
      [id, brokerage, ticker, shorted, open_date, fixToS(amount, 18), fixToS(basis), notes, fixToS(cur_value.v)]));
  await db.batch("insert into out_realized (id, brokerage, ticker, acquire_date, dispose_date, amount, basis, notes, proceeds) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    realized.map(({id, brokerage, ticker, acquire_date, dispose_date, amount, basis, notes, proceeds}) =>
      [id, brokerage, ticker, acquire_date, dispose_date, fixToS(amount, 18), fixToS(basis), notes, fixToS(proceeds)]));
  for (const b of Object.keys(brokerages)) await db.query("update brokerages set out_cash=? where brokerage=?;", [fixToS(brokerages[b].out_cash), b]);

  // save yf data
  if (yf_add.length) await db.batch("insert into yfdata (ticker, date, close, implied) values (?, ?, ?, ?) on duplicate key update close=values(close), implied=values(implied);", yf_add);
  await db.query("update tickers set out_price=null;");
  for (const ticker of new Set(holdings.map(e=>e.ticker))) await db.query("update tickers set out_price=? where ticker=?;", [fixToS(await yf_get(ticker, today), 18), ticker]);

  return res.send('<pre>' + out + '</pre><br /><a href="/">Back</a>');
};
