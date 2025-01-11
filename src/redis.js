const Redis = require('ioredis');

const redis = new Redis(6379, "redis", {db: 1});
const redis2 = new Redis(6379, "redis", {db: 2});

module.exports = {redis, redis2};
