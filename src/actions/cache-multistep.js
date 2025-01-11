const {multiStep} = require("../step.js");

module.exports = async (req, res) => {
  await multiStep(true);

  return res.send('OK');
};
