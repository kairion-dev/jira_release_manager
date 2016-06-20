var
  express = require('express'),
  Promise = require('bluebird'),
  router = express.Router(),
  log = require('../lib/logger.js'),
  config = require('config'),
  WebhookEngine = require('../webhooks/webhook-engine');



var engines = {};

// init webhook engine for JIRA and register webhooks
engines['jira'] = new WebhookEngine();
engines['jira'].registerByConfig(
  config.get('webhooks.jira'),
  { epicsKey: config.get('jira.epicsKey'), newCapKey: config.get('jira.newCapKey')}
);

// init webhook engine for Bitbucket and register webhooks
engines['bitbucket'] = new WebhookEngine();
engines['bitbucket'].registerByConfig(config.get('webhooks.bitbucket'));



/**
 * Receive and process webhook request from JIRA
 */
router.post('/jira', function(req, res, next) {
  // respond to server first before processing the incoming data
  res.status(200);
  res.send();

  // invoke the registered webhooks with the data posted by JIRA
  return engines['jira'].invoke(req.body)
    .then((res) => log.info(res))
    .catch((e) => log.warn("Execution warning for '" + e.id + "': " + e.error))
});


/**
 * Receive and process webhook request from Bitbucket
 */
router.post('/bitbucket', function(req, res, next) {
  // respond to server first before processing the incoming data
  res.status(200);
  res.send();

  // invoke the registered webhooks with the data posted by Bitbucket
  return engines['bitbucket'].invoke(req.body)
    .catch((e) => log.warn("Execution warning for '" + e.id + "': " + e.error));
});


/**
 * Show details about all webhook engines including running webhooks 
 */
router.get('/show', function(req, res, next) {
  return Promise.reduce(Object.keys(engines), (data, engineId) => {
    return engines[engineId].getWebhooksData()
      .then((webhooksData) => {
        data[engineId] = webhooksData;
        return data;
      })
  }, {})
  .then((enginesData) => {
    log.info(enginesData);
    var templateVars = {
        title: 'Webhooks',
        engines: enginesData
      };
    res.render('webhooks/show', templateVars)
  })
});


module.exports = router;