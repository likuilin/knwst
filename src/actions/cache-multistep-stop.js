const {redis} = require("../redis.js");

module.exports = async (req, res) => {
  await redis.del("multistep-run");

  return res.send('OK');
};
