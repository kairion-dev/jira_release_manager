"use strict";

var
	chai = require('chai'),
	should = chai.should(),
	expect = chai.expect,
	Promise = require('bluebird'),
	db = require('../../lib/db.js').db(require('config')),
	Core = require('../../lib/core.js'),
	KJiraHelper = require('../../lib/kjira-helper.js'),
	WebhookEngine = require('../../webhooks/webhook-engine.js'),
	Webhook = require('../../webhooks/tickets-to-development.js'),
	sinon = require('sinon'),
	helper = require('../helper/common.js');

require('sinon-as-promised');

var core = new Core();


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
            key: 'KD-3333',
            fields: { status: { id: jiraStatusNotPlanned } }
          }
        ]
      });
    });

    sinon.stub(webhook, 'doTransition', function(issueKey, transition) {
      return Promise.resolve({ issueKey: issueKey, request: transition });
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
				res.should.have.lengthOf(1);
				res[0].should.have.property('success', false);
				res[0].should.have.property('error', 'Invalid request. It should at least contain issue.key');
			})
	});
	it('Should not be executed because issue is not updated', function() {
		let request = JSON.parse(JSON.stringify(validWebhookRequest));
		request.webhookEvent = 'jira:some_other_action';
		return engine.invoke(request)
			.then((res) => {
				res.should.have.lengthOf(1);
				expect(res[0]).to.be.undefined;
			});
	});
  it.skip('Should not be executed because issue is not an epic', function() {
    
  });
  it("Should move two of three epic children to 'Selected for development'", function() {
    return engine.invoke(validWebhookRequest)
      .then((res) => {
        res.should.have.lengthOf(1);
        res[0].should.have.property('id', 'tickets-to-development');
        res[0].should.have.property('success', true);
        res[0].should.have.property('result');
        res[0].result.should.have.lengthOf(3);
        // first and third child should be moved because they were not planned
        checkTransition(res[0].result[0], 'KD-1111', jiraTransitionSelectedForDevelopment);
        checkTransition(res[0].result[2], 'KD-3333', jiraTransitionSelectedForDevelopment);
        // second child has some other status and thus nothing should happen
        expect(res[0].result[1]).to.be.undefined;
      });
  });
});