const fetch = require("node-fetch");

const {getQuote} = require("./anxiety.js");

const goBack = (link, text) => "<br /><br /><a href=\"" + link + "\">Click here to go back to " + text + ".</a>";

// amounts are stored as decimal(64,18)	and dollars are stored as decimal(50,4)
// because i want to log crypto quantities exactly, and they (probably) don't have more than 18 decimals in ERC20.decimals()
const sToFix = (s, decimals=4, soft=false) => {
  if (!s || s.length === 0) throw new Error("sToFix: empty s");
  const [a="", b=""] = s.split(".");
  if (!soft && b.length !== decimals || soft && b.length > decimals) throw new Error("sToFix: decimals " + decimals + " but s is " + s);
  return BigInt(a + b.padEnd(decimals, "0"));
};
const fixToS = (n, decimals=4, trimZeroes=false) => {
  if (typeof n !== "bigint") throw new Error("fixToS: not bigint " + n);
  const tens = 10n**BigInt(decimals);
  let pre = "";
  if (n < 0n) {
    pre = "-";
    n = -n;
  }
  let a = pre + (n/tens).toString(), b = (n%tens).toString().padStart(decimals, 0);
  // edge case lol
  if (b === "0") b = "";
  if (b.length !== decimals) throw new Error("fixToS: should not happen");
  if (trimZeroes) b = b.replace(/0*$/, "");
  if (b.length === 0) return a;
  else return a + "." + b;
};

const bnMin = (a, b) => (a<b) ? a : b;

const addDate = (date, days=1) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

module.exports = {getQuote, sToFix, fixToS, addDate, bnMin};
