const fetch = require("node-fetch");

const {getQuote} = require("./anxiety.js");

const goBack = (link, text) => "<br /><br /><a href=\"" + link + "\">Click here to go back to " + text + ".</a>";

// amounts are stored as decimal(64,18)	and dollars are stored as decimal(50,4)
// because i want to log crypto quantities exactly, and they (probably) don't have more than 18 decimals in ERC20.decimals()
const sToFix = (s, decimals=4) => {
  if (!s || s.length === 0) throw new Error("sToFix: empty s");
  const [a, b] = s.split(".");
  if (b.length !== decimals) throw new Error("sToFix: decimals " + decimals + " but s is " + s);
  return BigInt(a + b);
};
const fixToS = (b, decimals=4) => {
  if (typeof b !== "bigint") throw new Error("fixToS: not bigint", b);
  const exp = 10n**BigInt(decimals);
  let pre = "";
  if (b < 0) {
    pre = "-";
    b = -b;
  }
  return pre + (b/exp).toString() + "." + (b%exp).toString().padStart(decimals, 0);
}

module.exports = {getQuote, sToFix, fixToS};
