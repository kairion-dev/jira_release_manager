"use strict";

var
  chai = require('chai'),
  should = chai.should(),
  Promise = require('bluebird'),
  db = require('../../lib/db.js').db(require('config')),
  WebhookService = require('../../lib/webhook-service.js'),
  helper = require('../helper/common.js');

let tickets1 = [
  {"key":"KD-1111","project":"KD","summary":"ai doc-update","status":"In work","issueType":"Development","assignee":"Tomasz Porst","components":[],"parent":false,"newCap":false},
  {"key":"KD-10609", "status": "Not planned"}
];

let config = {
  'update-ticket': { path: '../webhooks/update-ticket', params: { dbName: 'tickets' } }
};

var service;

beforeEach(function() {
  service = new WebhookService();
  return db.tickets.removeAsync({}, { multi: true })
    .then(() => {
      return Promise.map(tickets1, (ticket) => {
        db.tickets.updateAsync({key: ticket.key}, {$set: ticket}, {upsert: true})
      })
    })
});

describe("Webhook 'Update Ticket'", function() {
  it('Webhook should not update non existing tickets', function() {
    return service.registerByConfig(config)
      .then(() => service.invoke({
          webhookEvent: 'jira:issue_updated',
          issue: {
            key: 'KD-2222',
            fields: { summary: 'Invalid update request cause ticket does not exist.' }
          }
        }))
      .then((res) => db.tickets.findAsync({ }))
      .then((docs) => {
        docs.should.have.lengthOf(tickets1.length); // we should have all tickets inserted initially
        helper.removeIds(docs);
        docs.should.contain.deep(tickets1[0]);
      })
  });
  it('Should not change anything cause wrong webhookEvent', function() {
    return service.registerByConfig(config)
      // empty request data so nothing should be changed
      .then(() => service.invoke({}))
      .then(() => db.tickets.findAsync({ }))
      .then((docs) => {
        docs.should.have.lengthOf(tickets1.length); // we should have all tickets inserted initially
        helper.removeIds(docs);
        docs.should.contain.deep(tickets1[0]);
      })
      // wrong webhookEvent so again nothing should be changed
      .then(() => service.invoke({ webhookEvent: 'some_other_event' }))
      .then(() => db.tickets.findAsync({ }))
      .then((docs) => {
        docs.should.have.lengthOf(tickets1.length); // we should have all tickets inserted initially
        helper.removeIds(docs);
        docs.should.contain.deep(tickets1[0]);
      });
  });
  it('Should not change anything cause key does not exist', function() {
    return service.registerByConfig(config)
      .then(() => service.invoke({
        webhookEvent: 'jira:issue_updated'
      }))
      // database should contain the ticket inserted
      .then(() => db.tickets.findAsync({ }))
      .then((docs) => {
        docs.should.have.lengthOf(tickets1.length); // we should have the tickets inserted initially
        helper.removeIds(docs);
        docs.should.contain.deep(tickets1[0]);
      })
  });
  it('Simple update', function() {
    return service.registerByConfig(config)
      // database should contain the ticket inserted
      .then(() => db.tickets.findAsync({ }))
      .then((docs) => {
        docs.should.have.lengthOf(tickets1.length);
        helper.removeIds(docs);
        docs.should.contain.deep(tickets1[0]);
        return service.invoke({
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

        docs.should.have.lengthOf(tickets1.length); // no new ticket, the original one was updated
        helper.removeIds(docs);
        docs.should.contain.deep(ticket);
      })
  });
  it('Updating epicsKey defined by customfield should work', function() {
    return service.registerByConfig(config)
      .then(() => service.invoke({
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
        docs.should.have.lengthOf(tickets1.length);
        helper.removeIds(docs);
        docs.should.contain.deep(tickets1[0]);
      })
      .then(() => service.invoke({
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
        docs.should.have.lengthOf(tickets1.length);
        let doc = helper.arrayToObject(docs, 'key')['KD-1111'];
        doc.should.have.property('parent');
        doc.parent.should.equal('KD-2222');
      })
  });
  it('Updates with components should trigger successful update and not break anything', function() {
    return service.registerByConfig(config)
      .then(() => db.tickets.findAsync({ }))
      .then((docs) => {
        docs.should.have.lengthOf(tickets1.length);
        helper.removeIds(docs);
        docs.should.contain.deep(tickets1[1]);
      })
      // request does not contain any component but all other fields should be updated successfully
      .then(() => service.invoke({
        timestamp: 1464941097428,
        webhookEvent: "jira:issue_updated",
        issue: {
          id: "38901",
          key: "KD-10609",
          fields: {
            status: {
              name: "Selected for Development",
              id: "10908"
            },
            components: []
          }
        }
      }))
      .then((res) => {
        res.webhookResults['update-ticket'].should.have.property('id', 'update-ticket');
        res.webhookResults['update-ticket'].should.have.property('success', true);
        return db.tickets.findAsync({ })
      })
      .then((docs) => {
        docs.should.have.lengthOf(tickets1.length); // we still should have the inital tickets only
        docs = helper.arrayToObject(docs, 'key');
        docs['KD-10609'].should.have.property('status', "Selected for Development");
      })
      // now it does contain components which also should be updated
      .then(() => service.invoke({
        timestamp: 1464941099000,
        webhookEvent: "jira:issue_updated",
        issue: {
          id: "38901",
          key: "KD-10609",
          fields: {
            status: {
              name: "Deployed"
            },
            components: [
              { id: "10900", name: 'a new component' },
              { id: "10901", name: 'and a second one' }
            ]
          }
        }
      }))
      .then((res) => {
        res.webhookResults['update-ticket'].should.have.property('id', 'update-ticket');
        res.webhookResults['update-ticket'].should.have.property('success', true);
        return db.tickets.findAsync({ })
      })
      .then((docs) => {
        docs.should.have.lengthOf(tickets1.length); // we still should have the inital tickets only
        docs = helper.arrayToObject(docs, 'key');
        docs['KD-10609'].should.have.property('status', "Deployed");
        docs['KD-10609'].should.have.property('components');
        docs['KD-10609'].components.should.contain('a new component');
        docs['KD-10609'].components.should.contain('and a second one');
      })
  });
});