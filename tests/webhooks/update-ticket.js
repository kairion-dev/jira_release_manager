"use strict";

var
	chai = require('chai'),
	should = chai.should(),
	Promise = require('bluebird'),
	db = require('../../lib/db.js').db(require('config')),
	WebhookEngine = require('../../webhooks/webhook-engine.js'),
	helper = require('../helper/common.js');

let tickets1 = [
	{"key":"KD-1111","project":"KD","summary":"ai doc-update","status":"In work","issueType":"Development","assignee":"Tomasz Porst","components":[],"parent":false,"newCap":false},
];

let config = {
	'update-ticket': { path: './update-ticket', params: { dbName: 'tickets' } }
};

var engine;

beforeEach(function() {
	engine = new WebhookEngine();
	return db.tickets.removeAsync({}, { multi: true })
		.then(() => {
			return Promise.map(tickets1, (ticket) => {
				db.tickets.updateAsync({key: ticket.key}, {$set: ticket}, {upsert: true})
			})
		})
});

describe("Webhook 'Update Ticket'", function() {
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
	it('Updating epicsKey defined by customfield should work', function() {
		return engine.registerByConfig(config, { epicsKey: 'customfield_10500'})
			.then(() => engine.invoke({
				webhookEvent: 'jira:issue_updated',
				issue: {
					key: 'KD-1111',
					fields: {
						customfield_wrong_key: 'KD-2222'
					}
				}
			}))
			// nothing should be changed cause epicsKey customfield key was not recognized
			.then(() => db.tickets.findAsync({}))
			.then((docs) => {
				docs.should.have.lengthOf(1);
				helper.removeIds(docs);
				docs.should.contain.deep(tickets1[0]);
			})
			.then(() => engine.invoke({
				webhookEvent: 'jira:issue_updated',
				issue: {
					key: 'KD-1111',
					fields: {
						customfield_10500: 'KD-2222'
					}
				}
			}))
			// now the key fits so we should have KD-2222 as new parent to KD-1111
			.then(() => db.tickets.findAsync({}))
			.then((docs) => {
				docs.should.have.lengthOf(1);
				let doc = docs[0];
				doc.should.have.property('parent');
				doc.parent.should.equal('KD-2222');
			})
	});
});