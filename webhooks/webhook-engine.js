"use strict";

var
  Promise = require('bluebird'),
  express = require('express'),
  router = express.Router(),
  db = require('../lib/db.js').db(),
  log = require('../lib/logger.js').webhooks,
  WebhookEngineInstance = require('../webhooks/webhook-engine-instance.js');

class WebhookEngine {

  constructor() {
    this.instances = {};
  }

  /**
   * Init webhook engine by registering all necessary routes and potential webhooks given by the config.
   * 
   * @param  {[type]} config
   *   is an optional parameter if instances have already been initiated before
   * @return {Router}
   *   express router, that can be used by calling app.use('/webhooks', WebhookEngine.init(config))
   */
  init(config) {
    // if we have a config, try to register new instances by using it
    if (config) {
      Object.keys(config).forEach((id) => {
        this.newInstance(id, '/' + id, config[id]);
      })
    }

    if (Object.keys(this.instances).length === 0) {
      throw new Error('No webhook engine instance registered. Please use WebhookEngine.newInstance() or provide a config in WebhookEngine.init()');
    }

    /**
     * Show details about all webhook engines including running webhooks 
     */
    router.get('/show', (req, res, next) => {
      return Promise.reduce(Object.keys(this.instances), (data, id) => {
        return this.instances[id].getWebhooksData()
          .then((webhooksData) => {
            data[id] = webhooksData;
            return data;
          })
      }, {})
      .then((instancesData) => {
        log.info(instancesData);
        var templateVars = {
            title: 'Webhooks',
            engines: instancesData
          };
        res.render('webhooks/show', templateVars)
      })
    });

    return router;
  }

  /**
   * Create a new service instance in order to register webhooks.
   * Example:
   *   id = 'jira', route = '/jira', config = { webhook1: ... , webhook2: ... }
   *   creates a new service with id 'jira' and
   *   registers webhook1 and webhook2 to listen on http://yourhost/webhooks/jira requests
   * 
   * @param  {String} id
   * @param  {String} route
   * @param  {Object} config
   */
  newInstance(id, route, config) {
    this.instances[id] = new WebhookEngineInstance();
    this.instances[id].registerByConfig(config);
    var routeFn = this.initRoute(this.instances[id]);
    router.post(route, routeFn);
  }

  /**
   * Return new route that should invoke the given instance.
   * 
   * @param  {WebhookEngineInstance} instance
   *   the instance that should be handled by the route
   * @return {Route}
   *   the route function that can be used by express
   */
  initRoute(instance) {
    return function(req, res, next) {
      // respond to server first before processing the incoming data
      res.status(200);
      res.send();

      // invoke the registered webhooks with the data posted by JIRA
      return instance.invoke(req.body)
        .then((res) => log.info(res))
        .catch((e) => log.warn("Execution warning for '" + e.id + "': " + e.error))
    };
  }

}

module.exports = WebhookEngine;