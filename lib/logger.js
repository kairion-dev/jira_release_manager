var
	config = require('config'),
	winston = require('winston');

// TODO add logging routes

var options = {
  level: config.has('log.level') ? config.get('log.level') : 'info',
  prettyPrint: true,
  colorize: true,
  silent: false,
  timestamp: false
}

winston.remove(winston.transports.Console);
winston.add(winston.transports.Console, options);
if (config.has('log.filename')) {
	options.filename = config.get('log.filename');
	options.timestamp = true;
  winston.add(winston.transports.File, options);	
}


module.exports = winston;