var
  express = require('express'),
  Promise = require('bluebird'),
  router = express.Router(),
  log = require('../lib/logger.js'),
  config = require('config'),
  WebhookEngine = require('../webhooks/webhook-engine');


// init webhook engine for JIRA and register webhooks
var engineJira = new WebhookEngine();
engineJira.registerByConfig(
	config.get('webhooks.jira'),
	{ epicsKey: config.get('jira.epicsKey'), newCapKey: config.get('jira.newCapKey')}
);

// receive webhook request from JIRA
router.post('/jira', function(req, res, next) {
	// respond to server first before processing the incoming data
	res.status(200);
	res.send();

	// invoke the registered webhooks with the data posted by JIRA
	return engineJira.invoke(req.body)
		.then((res) => log.info(res))
		.catch((e) => log.warn("Execution warning for '" + e.id + "': " + e.error))
});


// init webhook engine for Bitbucket and register webhooks
var engineBitbucket = new WebhookEngine();
engineBitbucket.registerByConfig(config.get('webhooks.bitbucket'));

// receive webhook request from Bitbucket
router.post('/bitbucket', function(req, res, next) {
	// respond to server first before processing the incoming data
	res.status(200);
	res.send();

	// invoke the registered webhooks with the data posted by Bitbucket
	return engineBitbucket.invoke(req.body)
		.catch((e) => log.warn("Execution warning for '" + e.id + "': " + e.error));
});


module.exports = router;