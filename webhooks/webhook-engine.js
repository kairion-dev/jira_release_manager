"use strict";

var
  Promise = require('bluebird'),
  AbstractWebhook = require('./abstract-webhook'),
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
	 * @param  {Object} params
	 *   Additional parameters that are added to each config taken from configWebhooks. This way you can add params subsequently.
	 * @return {Promise}
	 */
	registerByConfig(configWebhooks, params) {
		return Promise.map(Object.keys(configWebhooks), (id) => {
			// var config = JSON.parse(JSON.stringify(configWebhooks[id]));
			var config = configWebhooks[id];
			// append additional params to existing ones
			params = Object.keys(params || {}).reduce((results, key) => {
				results[key] = params[key];
				return results;
			}, config.params);
			// load module and register it with the id and config.params
			var Webhook = require(config.path);
			return this.register(new Webhook(id, params));
		});
	}

	/**
	 * Register a webhook module that inherits the abstract-webhook class
	 * @param  {Webhook} webhook
	 * @return {Promise}
	 */
	register(webhook) {
		if (!(webhook instanceof AbstractWebhook)) {
			return Promise.reject("The given webhook must be an instance of AbstractWebhook");
		};
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
			return webhook.shouldBeExecuted(request)
				.then((execute) => {
					if (execute) {
						return webhook.invoke(request)
							.then((res) => {
								return { id: webhook.id, success: true, result: res };
							})
							.catch((e) => {
								return { id: webhook.id, success: false, error: e };
							});
					}
				})
		});
	}

}

module.exports = WebhookEngine;