"use strict";

var
  Promise = require('bluebird'),
  AbstractWebhook = require('../webhooks/abstract-webhook'),
  db = require('../lib/db.js').db(),
  log = require('../lib/logger.js').webhooks;
  

class WebhookService {

  constructor() {
    this.webhooks = {};
  }

  /**
   * Register new webhooks by using a config.
   * 
   * @param  {Object} configWebhooks
   *   Object that holds the config for all webhooks that should be registered. The structure must look like
   *   { 'webhookId1': { path: '../my/path', params: { 'some': 'parameters'} } }
   *   The params properties are automatically added by the abstract webhook constructor and available in the specific webhook.
   * @return {Promise}
   */
  registerByConfig(configWebhooks) {
    return Promise.map(Object.keys(configWebhooks), (id) => {
      var config = configWebhooks[id];
      // load module and register it with the id and config.params
      var Webhook = require(config.path);
      return this.register(new Webhook(id, config.params || {}));
    });
  }

  /**
   * Register a webhook module that inherits the abstract-webhook class
   * 
   * @param  {Webhook} webhook
   * @return {Promise}
   */
  register(webhook) {
    if (!(webhook instanceof AbstractWebhook)) {
      return Promise.reject("The given webhook must be an instance of AbstractWebhook");
    };
    if (Object.keys(this.webhooks).indexOf(webhook.id) == -1) {
      log.info('Register webhook', webhook.id, webhook.params);
      return Promise.resolve(this.webhooks[webhook.id] = webhook)
        .then(() => this.webhooks[webhook.id].init());
    } else {
      return Promise.reject("Could not register '" + webhook.id + "' because a webhook already exists with same id.");
    }
  }

  /**
   * Call all registered webhooks with the given request.
   * Each webhook checks first if the request structure matches the expected structure before processing the data.
   * 
   * @param  {Object} request
   *   Some data that should be processed by the registered webhooks
   * @return {Promise}
   */
  invoke(request) {
    var timestamp = Date.now();
    return Promise.map(Object.keys(this.webhooks), (key) => {
      let webhook = this.webhooks[key];
      return webhook.shouldBeExecuted(request)
        .then((execute) => {
          if (execute) {
            return webhook.invoke(request)
              .then((res) => {
                return { id: webhook.id, success: true, result: res };
              })
          }
        })
        .catch((e) => {
          return { id: webhook.id, success: false, error: e.toString() };
        });
    })
      // map results array to 'webhookId -> result' structure
      .then((webhookResults) => Promise.reduce(webhookResults, (results, current) => {
        // filter webhooks that have not been invoked
        if (current) {
          results[current.id] = current;
        }
        return results;
      }, {}))
      // save webhook results and return them
      .then((webhookResults) => {
        return Promise.map(Object.keys(webhookResults), (key) => {
          let res = webhookResults[key];
          let update = {
            $inc: {
              invoked: 1,
              errors: (res.success ? 0 : 1)
            },
            $set: {
              last_time_invoked: timestamp
            }
          };
          return db.webhooks.updateAsync({ id: res.id }, update, { upsert: true });
        })
          // return structured results for further processing
          .then(() => {
            return { timestamp: timestamp, webhookResults: webhookResults };
          });
      });
  }

  /**
   * Get statistical data for all registered webhooks.
   * 
   * @return {Promise{WebhooksData}}
   */
  getWebhooksData() {
    var result = {};
    return Promise.each(Object.keys(this.webhooks), (webhookId) => {
      result[webhookId] = {
        params: this.webhooks[webhookId].params,
        description: this.webhooks[webhookId].description()
      };
      return db.webhooks.findOneAsync({ id: webhookId })
        .then((data) => {
          var invoked = data && data.invoked || 0;
          var errors = data && data.errors || 0;
          var last_time_invoked = '';
          if (data && data.last_time_invoked) {
            var date = new Date(data.last_time_invoked);
            last_time_invoked = date.toString();
          }
          result[webhookId]['data'] = {
            invoked: invoked,
            errors: errors,
            last_time_invoked: last_time_invoked
          };
        })
    })
    .then(() => result);
  }

}

module.exports = WebhookService;