"use strict";

var
	chai = require('chai'),
	should = chai.should(),
	Promise = require('bluebird'),
	config = require('config'),
	db = require('../../lib/db.js').db(config),
	WebhookEngine = require('../../webhooks/webhook-engine.js'),
	helper = require('../helper/common.js');

var webhookPaths = {
	'helloWorld' : { path: '../tests/webhooks/webhooks/hello-world'},
	'calc_add' : { path: '../tests/webhooks/webhooks/calculator', params: { operation: function(a,b) { return a + b } }}
}

var engine;

beforeEach(function() {
	engine = new WebhookEngine();
});

describe('Testing Webhook Engine', function() {
	describe('Basics', function() {
		it('Webhook engine should start up and work without any error', function() {
			let Webhook = require('./webhooks/hello-world');
			engine.register(new Webhook('webhook1'))
			  .then(() => engine.invoke('Hello World'))
				.then((results) => {
					results.should.have.lengthOf(1);
					results[0].result.should.equal('Hello World');
				});
		});
		it('Webhook engine should also work fine by passing webhooks via constructor config', function() {
			let config = { 'helloWorld': webhookPaths.helloWorld };
			engine.registerByConfig(config)
				.then(() => engine.invoke('Hello World by config'))
				.then((results) => {
					results.should.have.lengthOf(1);
					results[0].result.should.equal('Hello World by config');
				});
		});
	});
	describe('Webhook structure and logic', function() {
		it('Data passed by webhook constructor should be processed', function() {
			let Webhook = require('./webhooks/hello-world');
			engine.register(new Webhook('webhook1', { prefix: 'Prefix before Hello World: ' }))
			  .then(() => engine.invoke('Hello World'))
				.then((results) => {
					results.should.have.lengthOf(1);
					results[0].result.should.equal('Prefix before Hello World: Hello World');
				});
		});
		it('Webhook should not be invoked', function() {
			let Webhook = require('./webhooks/hello-world');
			engine.register(new Webhook('webhook1'))
				// HelloWorldWebhook should be not executed when request equals 'dont execute'
			  .then(() => engine.invoke('dont execute'))
				.then((results) => {
					results.should.have.lengthOf(1);
					chai.expect(results[0]).to.be.undefined;
				});
		});
		it('Engine should work fine with multiple webhooks of different types', function() {
			let config = { 'helloWorld': webhookPaths.helloWorld, 'calc_add': webhookPaths.calc_add };
			let Calculator = require('./webhooks/calculator');
			let calcMult = new Calculator('calc_mult', { operation: function(a,b) { return a * b; } });

			let request = { a: 5, b: 3 };

			engine.registerByConfig(config) // register two webhooks by using the config
				.then(() => engine.register(calcMult)) // and add another one manually
				.then(() => engine.invoke(request))
				.then((results) => {
					results.should.have.lengthOf(3); // we expect results from both webhooks
					results = helper.arrayToObject(results, 'id'); // to access results easier 
					results['helloWorld'].result.should.deep.equal(request);
					results['calc_add'].result.should.equal(8); // 5 + 3
					results['calc_mult'].result.should.equal(15); // 5 * 3
				})
		});
	});
});
describe('Testing Webhooks', function() {

	let config = {
		'update-ticket': { path: './update-ticket', params: { dbName: 'tickets' } }
	};
	let tickets1 = [
		{"key":"KD-1111","project":"KD","summary":"ai doc-update","status":"In work","issueType":"Development","assignee":"Tomasz Porst","components":[],"parent":false,"newCap":false},
	];

	before(function() {
		return db.tickets.removeAsync({}, { multi: true })
			.then(() => {
				return Promise.map(tickets1, (ticket) => {
					db.tickets.updateAsync({key: ticket.key}, {$set: ticket}, {upsert: true})
				})
			})
	});

	describe('Update ticket', function() {
		it('Webhook should not update non existing tickets', function() {
			return engine.registerByConfig(config)
				.then(() => engine.invoke({
						webhookEvent: 'jira:issue_updated',
						issue: {
							key: 'KD-2222',
							fields: { summary: 'Invalid update request cause ticket does not exist.' }
						}
					}))
				.then((res) => db.tickets.findAsync({ }))
				.then((docs) => {
					docs.should.have.lengthOf(1);
					helper.removeIds(docs);
					docs.should.contain.deep(tickets1[0]);
				})
		});
		it('Should not change anything cause wrong webhookEvent', function() {
			return engine.registerByConfig(config)
				// empty request data so nothing should be changed
				.then(() => engine.invoke({}))
				.then(() => db.tickets.findAsync({ }))
				.then((docs) => {
					docs.should.have.lengthOf(1);
					helper.removeIds(docs);
					docs.should.contain.deep(tickets1[0]);
				})
				// wrong webhookEvent so again nothing should be changed
				.then(() => engine.invoke({ webhookEvent: 'some_other_event' }))
				.then(() => db.tickets.findAsync({ }))
				.then((docs) => {
					docs.should.have.lengthOf(1);
					helper.removeIds(docs);
					docs.should.contain.deep(tickets1[0]);
				});
		});
		it('Should not change anything cause key does not exist', function() {
			return engine.registerByConfig(config)
				.then(() => engine.invoke({
					webhookEvent: 'jira:issue_updated'
				}))
				// database should contain the ticket inserted
				.then(() => db.tickets.findAsync({ }))
				.then((docs) => {
					docs.should.have.lengthOf(1);
					helper.removeIds(docs);
					docs.should.contain.deep(tickets1[0]);
				})
		});
		it('Simple update', function() {
			return engine.registerByConfig(config)
				// database should contain the ticket inserted
				.then(() => db.tickets.findAsync({ }))
				.then((docs) => {
					docs.should.have.lengthOf(1);
					helper.removeIds(docs);
					docs.should.contain.deep(tickets1[0]);
					return engine.invoke({
						webhookEvent: 'jira:issue_updated',
						issue: {
							key: 'KD-1111',
							fields: {
				        project: { key: 'KD' },
				        summary: 'ai doc-update',
				        status: { name: 'Deployed' },
				        issuetype: { name: 'Development' },
				        assignee: { displayName: 'Matthias' },
				        components: [],
				        parent: false,
				        newCap: false
							}
						}
					});
				})
				// database now should contain the updated ticket
				.then(() => db.tickets.findAsync({ }))
				.then((docs) => {
					// the new entry should look like this
					let ticket = JSON.parse(JSON.stringify(tickets1[0]));
					ticket.status = 'Deployed';
					ticket.assignee = 'Matthias';

					docs.should.have.lengthOf(1); // no new ticket, the original one was updated
					helper.removeIds(docs);
					docs.should.contain.deep(ticket);
				})
		});
	});
});