const {redis} = require("../redis.js");

module.exports = async (req, res) => {
  await redis.flushall();

  return res.send('OK');
};
