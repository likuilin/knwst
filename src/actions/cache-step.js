const {step} = require("../step.js");

module.exports = async (req, res) => {
  await step(true);

  return res.send('OK');
};
