const mariadb = require('mariadb');

const db = mariadb.createPool({
   host: 'db', 
   database: 'knwst', 
   user: 'knwst', 
   password: 'knwst',
   connectionLimit: 5
});

module.exports = {db};
