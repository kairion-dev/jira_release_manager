"use strict";

var Promise = require('bluebird'),
	Webhook = require('../../../webhooks/abstract-webhook');

class CalculatorWebhook extends Webhook {

	invoke(data) {
		return Promise.resolve()
			.then(() => {
				return this.params.operation(data.a, data.b);
			})
	}

}

module.exports = CalculatorWebhook;