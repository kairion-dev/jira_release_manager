"use strict";

var
  chai = require('chai'),
  should = chai.should(),
  expect = chai.expect,
  Promise = require('bluebird'),
  db = require('../../lib/db.js').db(require('config')),
  Core = require('../../lib/core.js'),
  KJiraHelper = require('../../lib/kjira-helper.js'),
  WebhookEngine = require('../../lib/webhook-engine-instance.js'),
  Webhook = require('../../webhooks/create-auxiliary-tickets.js'),
  sinon = require('sinon'),
  helper = require('../helper/common.js');

require('sinon-as-promised');


var epicsKey = 'customfield_10500';


function checkTicket(ticket, summary, epicsId, projectId, issueTypeId, assigneeName) {
  // is the basic ticket structure well-formed?
  ticket.should.have.property('project');
  ticket.should.have.property('issuetype');
  ticket.should.have.property('summary');
  ticket.should.have.property('assignee');
  ticket.should.have.property('components');
  ticket.should.have.property(epicsKey);
  // check if ticket values are correct
  ticket.project.should.have.property('key');
  ticket.project.key.should.equal(projectId);
  ticket.issuetype.should.have.property('id');
  ticket.issuetype.id.should.equal(issueTypeId);
  ticket.summary.should.equal(summary);
  ticket.assignee.should.have.property('name');
  ticket.assignee.name.should.equal(assigneeName);
  ticket[epicsKey].should.equal(epicsId);
}

describe("Webhook 'Create Auxiliary Tickets'", function() {
  describe('Test Kairion specific Jira functionality', function() {
    it('Request resulting from createAuxiliaryIssueRequest() is well-formed', function() {
      var kjira = new KJiraHelper();
      var request1 = kjira.createAuxiliaryIssueRequest('KD', 101, 'This is my ticket description', 'Karl', 55, [ { name: 'Jira Release Manager'} ]);
      var request2 = kjira.createAuxiliaryIssueRequest('KD', 101, 'This is my ticket description', 'Karl', 'KD-55', [ { name: 'Jira Release Manager'} ]);
      var request3 = kjira.createAuxiliaryIssueRequest('KD', '101', 'This is my ticket description', 'Karl', 'KD-55', [ { name: 'Jira Release Manager'} ]);

      // the resulting request should look like this
      var expectedRequest = {
        'fields': {
          'project': {
            'key': 'KD'
          },
          'issuetype': {
            'id' : '101'
          }, 
          'summary': 'This is my ticket description',
          'assignee': {
            'name': 'Karl'
          },
          components: [ { name: 'Jira Release Manager'} ]
        }
      };
      expectedRequest.fields[epicsKey] = 'KD-55';

      // test request structures
      request1.should.deep.equal(expectedRequest);
      request2.should.deep.equal(expectedRequest);
      request3.should.deep.equal(expectedRequest);
    });
  });
  describe('Test webhook functionality', function() {

    var webhook;
    var engine;

    var validWebhookRequest = {
      webhookEvent: 'jira:issue_created',
      issue: {
        key: 'KTEST-9768'
      }
    };

    before(function() {
      this.timeout(4000); // the test is waiting a bit longer before failing
      engine = new WebhookEngine();
      webhook = new Webhook('create-auxiliary-tickets');

      // fake mapping bwetween issueTypeIds and issueTypeNames
      sinon.stub(webhook, 'initIssueTypeNames', function() {
        var mapping = {
          '11301': 'Deployment',
          '5':     'Epic',
          '9':     'Functional Review',
          '10500': 'Concept / Roadmap',
          '11305': 'Code Review'
        };
        return Promise.resolve(mapping);
      });
      // fake issue information originally delivered by Jira
      sinon.stub(webhook, 'findIssue', function(issueKey) {
        var issue = {};
        issue['KTEST-9768'] = {
          key: 'KTEST-9768',
          fields: {
            issuetype: {
              id: '5'
            },
            summary: 'Workpackage: Adding a test issue',
            project: {
              key: 'KTEST'
            },
            assignee: {
              name: 'mwick'
            },
            components: []
          }
        };
        issue['KTEST-1111'] = {
          key: 'KTEST-1111',
          fields: {
            issuetype: {
              id: '9' // functional review issue type 
            }
          }
        }
        return Promise.resolve(issue[issueKey]);
      });
      // just return the issueRequests instead of sending them to Jira
      sinon.stub(webhook, 'addIssue', function(issueRequest) {
        return issueRequest;
      });
      return engine.register(webhook);
    });

    describe('Test shouldBeExecuted()', function() {
      it('should work with a valid webhook request', function() {
        return engine.invoke(validWebhookRequest)
          .then((res) => {
            Object.keys(res.webhookResults).should.have.lengthOf(1);
            res.webhookResults['create-auxiliary-tickets'].should.have.property('success', true);
            res.webhookResults['create-auxiliary-tickets'].should.have.property('id', 'create-auxiliary-tickets');
          })
      });
      it('should not be executed when key is missing', function() {
        let invalidRequest = JSON.parse(JSON.stringify(validWebhookRequest));
        delete invalidRequest.issue;
        return engine.invoke(invalidRequest)
          .then((res) => {
            Object.keys(res.webhookResults).should.have.lengthOf(1);
            res.webhookResults['create-auxiliary-tickets'].should.have.property('success', false);
            res.webhookResults['create-auxiliary-tickets'].should.have.property('error', 'Request malformed. It should at least contain issue.key');
          })
      });
      it('should not be executed when key is not found in Jira', function() {
        let request = JSON.parse(JSON.stringify(validWebhookRequest));
        request.issue.key = 'does not exist';
        return engine.invoke(request)
          .then((res) => {
            Object.keys(res.webhookResults).should.have.lengthOf(0);
          })
      });
      it('should not be executed when created issue is no epic', function() {
        let request = JSON.parse(JSON.stringify(validWebhookRequest));
        request.issue.key = 'KTEST-1111';
        return engine.invoke(request)
          .then((res) => {
            Object.keys(res.webhookResults).should.have.lengthOf(0);
          })
      });
    });
    describe('Test generating auxiliary tickets', function() {
      it('Test Jira Rest API requests to add auxiliary tickets', function() {
        return engine.invoke(validWebhookRequest)
          .then((res) => {
            Object.keys(res.webhookResults).should.have.lengthOf(1);
            var tickets = res.webhookResults['create-auxiliary-tickets'].result;
            tickets.should.have.lengthOf(4); // we expect 4 ticket requests
            tickets = tickets.map((ticket) => ticket.fields); // remove one level to directly access properties
            tickets = helper.arrayToObject(tickets, 'summary'); // to access tickets more easy

            var summary = 'Deployment: Adding a test issue';
            tickets.should.have.property(summary);
            checkTicket(tickets[summary], summary, 'KTEST-9768', 'KTEST', '11301', 'mwick');
            var summary = 'Functional Review: Adding a test issue';
            tickets.should.have.property(summary);
            checkTicket(tickets[summary], summary, 'KTEST-9768', 'KTEST', '9', 'mwick');
            var summary = 'Concept / Roadmap: Adding a test issue';
            tickets.should.have.property(summary);
            checkTicket(tickets[summary], summary, 'KTEST-9768', 'KTEST', '10500', 'mwick');
            var summary = 'Code Review: Adding a test issue';
            tickets.should.have.property(summary);
            checkTicket(tickets[summary], summary, 'KTEST-9768', 'KTEST', '11305', 'mwick');
          });
        });
    });
  });
});