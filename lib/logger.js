var winston = require('winston');

// TODO add logging routes

winston.remove(winston.transports.Console);
winston.add(winston.transports.Console, {
  level: 'info',
  prettyPrint: true,
  colorize: true,
  silent: false,
  timestamp: false
});

module.exports = winston;