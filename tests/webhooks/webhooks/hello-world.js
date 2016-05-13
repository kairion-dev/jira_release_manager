"use strict";

var Promise = require('bluebird'),
	Webhook = require('../../../webhooks/abstract-webhook');

class HelloWorldWebhook extends Webhook {

	shouldBeExecuted(data) {
		if (data === 'dont execute') {
			return false;
		}
		return true;
	}

	invoke(data) {
		return Promise.resolve()
			.then(() => {
				if (this.params.prefix) {
					return this.params.prefix + data;
				} else {
					return data;
				}
			})
	}

}

module.exports = HelloWorldWebhook;