var
  Promise = require('bluebird'),
  config = require('config'),
  Datastore = Promise.promisifyAll(require('nedb'));

var db;

/**
 * @return {db handler}
 */
module.exports.db = function() {
  if (!db) {
    if (!config.has('databases.tags') || !config.has('databases.tickets')) {
      throw new Error('Please specifiy databases.tags and databases.tickets in your config file.');
    };
    db = {
      tags: Promise.promisifyAll(new Datastore({ filename: config.get('databases.tags'), autoload: true })),
      tickets: Promise.promisifyAll(new Datastore({ filename: config.get('databases.tickets'), autoload: true })),
      webhooks: Promise.promisifyAll(new Datastore({ filename: config.get('databases.webhooks'), autoload: true }))
    };
  }
  return db;
}