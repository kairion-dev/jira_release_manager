var
	Promise = require('bluebird'),
	Datastore = Promise.promisifyAll(require('nedb'));

var db;

/**
 * @return {db handler}
 */
module.exports.db = function(config) {
	if (config) {
		db = {
	    tags: Promise.promisifyAll(new Datastore({ filename: config.get('databases.tags'), autoload: true })),
	    tickets: Promise.promisifyAll(new Datastore({ filename: config.get('databases.tickets'), autoload: true }))
	  };
	}
	if (!db) {
		throw new Error('Database not initialized. Please pass correct config in order to init.');
	}
	return db;
}