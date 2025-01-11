const {Temporal} = require("temporal-polyfill");

const {redis} = require("../redis.js");

module.exports = async (req, res) => {
  const synced = await redis.get("synced-to-date");
  if (!synced) throw new Error("synced-to-date null in rewind");
  await redis.set("synced-to-date", Temporal.PlainDate.from(synced).add({years: -1}).toString());

  return res.send('OK');
};
