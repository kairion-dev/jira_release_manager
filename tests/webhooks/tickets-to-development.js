"use strict";

var
	chai = require('chai'),
	should = chai.should(),
	expect = chai.expect,
	Promise = require('bluebird'),
	db = require('../../lib/db.js').db(require('config')),
	WebhookEngine = require('../../webhooks/webhook-engine.js'),
	Webhook = require('../../webhooks/tickets-to-development.js'),
	sinon = require('sinon'),
	helper = require('../helper/common.js');

require('sinon-as-promised');


var jiraIssueTypeEpic = '5';
var jiraStatusNotPlanned = '10307';
var jiraStatusselectedForDevelopment = '10908';
var jiraTransitionSelectedForDevelopment = '911';


function checkTransition(child, issueKey, transitionId) {
  child.should.have.property('issueKey', issueKey);
  child.should.have.property('request');
  child.request.should.have.property('transition');
  child.request.transition.should.have.property('id', transitionId);
}


describe("Webhook 'Tickets to development when moving epic to planned'", function() {
	var webhook;
	var engine;

	var validWebhookRequest = {
		webhookEvent: 'jira:issue_updated',
		issue: {
      fields: {
        status: { id: jiraStatusNotPlanned },
        issuetype: { id: jiraIssueTypeEpic }
      },
			key: 'KD-10295'
		},
    changelog: {
      id: '239389',
      items: [
        {
          field: 'status',
          fieldtype: 'jira',
          from: jiraStatusNotPlanned,
          fromString: 'Not planned',
          to: jiraStatusselectedForDevelopment,
          toString: 'Selected for Development'
        },
        {
          field: 'some_other_field'
        }
      ]
    }
	};

  before(function() {
    this.timeout(4000);
    engine = new WebhookEngine();
    webhook = new Webhook('tickets-to-development');

    sinon.stub(webhook, 'getAllEpicChildren', function(issueKey) {
      return Promise.resolve({
        issues: [
          {
            key: 'KD-1111',
            fields: { status: { id: jiraStatusNotPlanned } }
          },
          {
            key: 'KD-2222',
            fields: { status: { id: '12345' } }
          },
          {
            key: 'KD-4444', // all tickets starting with 'KD-4...' will throw Jira fake errors
            fields: { status: { id: jiraStatusNotPlanned } }
          },
          {
            key: 'KD-4010',
            fields: { status: { id: jiraStatusNotPlanned } }
          },
          {
            key: 'KD-3333',
            fields: { status: { id: jiraStatusNotPlanned } }
          }
        ]
      });
    });

    sinon.stub(webhook, 'doTransition', function(issueKey, transition) {
      // all tickets starting with KD-4 should result in a fake jira error which occurs e.g. when no time is estimated
      if (issueKey.startsWith('KD-4')) {
        return Promise.reject('Error: 400: Fake testing error while updating');
      } else {
        return Promise.resolve({ issueKey: issueKey, request: transition });
      } 
    });

    sinon.stub(webhook, 'findIssue', function(issueKey) {
      var issues = {
        'KD-4010': {
          fields: {
            timeestimate: null,
            subtasks: [
              { key: 'KD-4011' }, { key: 'KD-4012' }
            ]
          }
        },
        'KD-4020': {
          fields: {
            timeestimate: null,
            subtasks: [
              { key: 'KD-4021' }, { key: 'KD-4022' }
            ]
          }
        },
        'KD-4030': {
          fields: {
            timeestimate: null,
            subtasks: [
              { key: 'KD-4031' }, { key: 'KD-4032' }
            ]
          }
        }
      }
      return Promise.resolve(issues[issueKey]);
    });

    sinon.stub(webhook, 'getTimeEstimates', function(issueKeys) {
      var issues = {
        'KD-4011': {
          fields: {
            timeestimate: 3600
          }
        },
        'KD-4012': {
          fields: {
            timeestimate: 600
          }
        },
        'KD-4021': {
          fields: {
            timeestimate: null
          }
        },
        'KD-4022': {
          fields: {
            timeestimate: 0
          }
        }
      }
      return Promise.reduce(issueKeys, (total, issueKey) => {
        if (issues[issueKey]) {
          total.issues.push(issues[issueKey]);
          total.total += 1;
        }
        return total;
      }, { issues: [], total: 0 });
    });

    sinon.stub(webhook, 'initTimetracking', function(issueKey) {
      return Promise.resolve({ 'initTimetracking': issueKey });
    });

    return engine.register(webhook);
  });

  it('Issue should be an epic that has been moved from not planned to selected for development', function() {
    return webhook.epicMovedFromNotPlannedToDevelopment(validWebhookRequest)
      .then((res) => res.should.equal(true));
  });
	it('Should not be executed because key is missing', function() {
		let request = JSON.parse(JSON.stringify(validWebhookRequest));
		delete request.issue.key;
		return engine.invoke(request)
			.then((res) => {
        Object.keys(res.webhookResults).should.have.lengthOf(1);
				res.webhookResults['tickets-to-development'].should.have.property('success', false);
				res.webhookResults['tickets-to-development'].should.have.property('error', 'Invalid request. It should at least contain issue.key');
			})
	});
	it('Should not be executed because issue is not updated', function() {
		let request = JSON.parse(JSON.stringify(validWebhookRequest));
		request.webhookEvent = 'jira:some_other_action';
		return engine.invoke(request)
			.then((res) => {
				Object.keys(res.webhookResults).should.have.lengthOf(0);
			});
	});
  it.skip('Should not be executed because issue is not an epic', function() {
    
  });
  it("Should move two of four epic children to 'Selected for development'", function() {
    return engine.invoke(validWebhookRequest)
      .then((res) => {
        Object.keys(res.webhookResults).should.have.lengthOf(1);
        var webhookResult = res.webhookResults['tickets-to-development'];
        webhookResult.should.have.property('id', 'tickets-to-development');
        webhookResult.should.have.property('success', true);
        webhookResult.should.have.property('result');
        webhookResult.result.should.have.lengthOf(5);
        // first and fifth child should be moved because they were not planned
        checkTransition(webhookResult.result[0], 'KD-1111', jiraTransitionSelectedForDevelopment);
        checkTransition(webhookResult.result[4], 'KD-3333', jiraTransitionSelectedForDevelopment);
        // second child has some other status and thus nothing should happen
        expect(webhookResult.result[1]).to.be.undefined;
        // third child has no time estimated which results in an error response. Nevertheless other children should not be affected from this.
        expect(webhookResult.result[2]).to.be.undefined;
        // the estimated time for the fourth child could not be set which results in an error reponse.
        expect(webhookResult.result[3]).to.be.undefined;
      });
  });
  describe("Test tryToInitTimeEstimate()", function() {
    it("Estimated subtickets", function() {
      // TODO in fact, the time should be set correctly, but the sinon.stub always returns an error for tickets starting with KD-4
      // -> implement some logic that processes the webhook successfully if a parent ticket could be initialized by checking subticket times
      return webhook.tryToInitTimeEstimate('KD-4010')
        .then((res) => Promise.reject('We should not see this'))
        .catch((e) => e.should.equal('Estimated and remaining time set but still failing to set status'))
    });
    it("Non-estimated subtickets", function() {
      return webhook.tryToInitTimeEstimate('KD-4020')
        .then((res) => Promise.reject('We should not see this'))
        .catch((e) => e.should.equal('No subticket or none of them has estimated time'))
    });
    it("No subtickets", function() {
      return webhook.tryToInitTimeEstimate('KD-4030')
        .then((res) => Promise.reject('We should not see this'))
        .catch((e) => e.should.equal('No subticket or none of them has estimated time'))
    });
  });
});