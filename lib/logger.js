var
  config = require('config'),
  winston = require('winston');


var releasemanager = new winston.Logger({
  transports: [
    new winston.transports.File({
      level: config.has('log.releasemanager.level') ? config.get('log.releasemanager.level') : 'info',
      filename: config.has('log.releasemanager.filename') ? config.get('log.releasemanager.filename') : 'releasemanager.log',
      prettyPrint: true,
      colorize: true,
      silent: false,
      timestamp: true
    }),
    new winston.transports.Console({
      level: config.has('log.releasemanager.level') ? config.get('log.releasemanager.level') : 'info',
      prettyPrint: true,
      colorize: true,
      silent: false,
      timestamp: true
    })
  ]
});

var webhooks = new winston.Logger({
  transports: [
    new winston.transports.File({
      level: config.has('log.webhooks.level') ? config.get('log.webhooks.level') : 'info',
      filename: config.has('log.webhooks.filename') ? config.get('log.webhooks.filename') : 'webhooks.log',
      prettyPrint: true,
      colorize: true,
      silent: false,
      timestamp: true
    })
  ]
});


module.exports = {
  releasemanager: releasemanager,
  webhooks: webhooks
}