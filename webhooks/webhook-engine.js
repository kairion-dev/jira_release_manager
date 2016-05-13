"use strict";

var
  Promise = require('bluebird'),
  log = require('../lib/logger.js');

class WebhookEngine {

	constructor() {
		this.webhooks = {};
	}

	/**
	 * Register new webhooks by using a config.
	 * @param  {Object} configWebhooks
	 *   Object that holds the config for all webhooks that should be registered. The structure must look like
	 *   { 'webhookId1': { path: '../my/path', params: { 'some': 'parameters'} } }
	 *   The params properties are automatically added by the abstract webhook constructor and available in the specific webhook.
	 * @return {Promise}
	 */
	registerByConfig(configWebhooks) {
		return Promise.map(Object.keys(configWebhooks), (id) => {
			var config = configWebhooks[id];
			var Webhook = require(config.path);
			return this.register(new Webhook(id, config.params));
		});
	}

	/**
	 * Register a webhook module that inherits the abstract-webhook class
	 * @param  {Webhook} webhook
	 * @return {Promise}
	 */
	register(webhook) {
		if (Object.keys(this.webhooks).indexOf(webhook.id) == -1) {
			return Promise.resolve(this.webhooks[webhook.id] = webhook);
		} else {
			return Promise.reject("Could not register '" + webhook.id + "' because a webhook already exists with same id.");
		}
	}

	/**
	 * Call all registered webhooks with the given request.
	 * Each webhook checks first if the request structure matches the expected structure before processing the data.
	 * @param  {Object} request
	 *   Some data that should be processed by the registered webhooks
	 * @return {Promise}
	 */
	invoke(request) {
		return Promise.map(Object.keys(this.webhooks), (key) => {
			let webhook = this.webhooks[key];
			if (webhook.shouldBeExecuted(request)) {
				return webhook.invoke(request)
					.then((res) => {
						return { id: webhook.id, result: res };
					})
					.catch((e) => {
						log.warn("Execution warning for '" + webhook.id + "': " + e);
					});
			}
		});
	}

}

module.exports = WebhookEngine;