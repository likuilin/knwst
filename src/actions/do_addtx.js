const {db} = require("../db.js");
const {goBack} = require("../helpers.js");

module.exports = async (req, res) => {
  const result = await db.query("insert into txs (date, ttype, ticker, action, amount, price_comment, comm_comment, net, brokerage, locate, locate_basis, custom, note_comment, confirm_comment) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning *;", [
    req.body.date,
    req.body.ttype || "",
    req.body.ticker || "",
    req.body.action || null,
    req.body.amount || null,
    req.body.price_comment || null,
    req.body.comm_comment || null,
    req.body.net || null,
    req.body.brokerage || null,
    req.body.locate || null,
    req.body.locate_basis || null,
    req.body.custom || "",
    req.body.note_comment || "",
    req.body.confirm_comment || null
  ]);
  
  return res.send('Added successfully as txid ' + result[0].txid + '. <a href="/">Back</a>');
};
