var
  express = require('express'),
  Promise = require('bluebird'),
  router = express.Router(),
  log = require('../lib/logger.js'),
  config = require('config'),
  WebhookEngine = require('../webhooks/webhook-engine');

// init webhook engine and register webhooks by using the config
var engine = new WebhookEngine();
engine.registerByConfig(config.get('webhooks.jira'));

// receive webhook request
router.post('/jira', function(req, res, next) {
	// respond to server first before processing the incoming data
	res.status(200);
	res.send();

	// invoke the registered webhooks with the data posted by jira
	return engine.invoke(req.body)
		.then((res) => {
			log.info(res);
		})
});

module.exports = router;