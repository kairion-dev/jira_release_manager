"use strict";

var
  Promise = require('bluebird'),
  express = require('express'),
  router = express.Router(),
  db = require('./db.js').db(),
  log = require('./logger.js').webhooks,
  WebhookService = require('./webhook-service.js');

class WebhookEngine {

  constructor() {
    this.services = {};
  }

  /**
   * Init webhook engine by registering all necessary routes and potential webhooks given by the config.
   * 
   * @param  {[type]} config
   *   is an optional parameter if services have already been initiated before
   * @return {Router}
   *   express router, that can be used by calling app.use('/webhooks', WebhookEngine.init(config))
   */
  init(config) {
    // if we have a config, try to register new services by using it
    if (config) {
      Object.keys(config).forEach((id) => {
        this.newService(id, '/' + id, config[id]);
      })
    }

    if (Object.keys(this.services).length === 0) {
      throw new Error('No webhook service registered. Please use WebhookEngine.newService() or provide a config in WebhookEngine.init()');
    }

    /**
     * Show details about all webhook engines including running webhooks 
     */
    router.get('/show', (req, res, next) => {
      return Promise.reduce(Object.keys(this.services), (data, id) => {
        return this.services[id].getWebhooksData()
          .then((webhooksData) => {
            data[id] = webhooksData;
            return data;
          })
      }, {})
      .then((servicesData) => {
        log.info(servicesData);
        var templateVars = {
            title: 'Webhooks',
            engines: servicesData
          };
        res.render('webhooks/show', templateVars)
      })
    });

    return router;
  }

  /**
   * Create a new service in order to register webhooks.
   * Example:
   *   id = 'jira', route = '/jira', config = { webhook1: ... , webhook2: ... }
   *   creates a new service with id 'jira' and
   *   registers webhook1 and webhook2 to listen on http://yourhost/webhooks/jira requests
   * 
   * @param  {String} id
   * @param  {String} route
   * @param  {Object} config
   */
  newService(id, route, config) {
    this.services[id] = new WebhookService();
    this.services[id].registerByConfig(config);
    var routeFn = this.initRoute(this.services[id]);
    router.post(route, routeFn);
  }

  /**
   * Return new route that should invoke the given service.
   * 
   * @param  {WebhookService} service
   *   the service that should be handled by the route
   * @return {Route}
   *   the route function that can be used by express
   */
  initRoute(service) {
    return function(req, res, next) {
      // respond to server first before processing the incoming data
      res.status(200);
      res.send();

      // invoke the registered webhooks with the data posted by JIRA
      return service.invoke(req.body)
        .then((res) => log.info(res))
        .catch((e) => log.warn("Execution warning for '" + e.id + "': " + e.error))
    };
  }

}

module.exports = WebhookEngine;