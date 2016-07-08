"use strict";

var
  chai = require('chai'),
  should = chai.should(),
  expect = chai.expect,
  Promise = require('bluebird'),
  db = require('../../lib/db.js').db(require('config')),
  Core = require('../../lib/core.js'),
  KJiraHelper = require('../../lib/kjira-helper.js'),
  WebhookService = require('../../lib/webhook-service.js'),
  Webhook = require('../../webhooks/tickets-to-deploy-after-release.js'),
  sinon = require('sinon'),
  helper = require('../helper/common.js');

require('sinon-as-promised');

var core = new Core();

var jiraIssueTypeEpic = '5';
var jiraStatusDeployed = '5';
var jiraTransitionDeployed = '941';


function checkTransition(child, issueKey, transitionId) {
  child.should.have.property('issueKey', issueKey);
  child.should.have.property('request');
  child.request.should.have.property('transition');
  child.request.transition.should.have.property('id', transitionId);
}


describe("Webhook 'Tickets to deploy after release'", function() {
  var webhook;
  var service;

  var validWebhookRequest = {
    webhookEvent: 'jira:issue_updated',
    issue: {
      fields: {
        status: { id: jiraStatusDeployed },
        issuetype: { id: jiraIssueTypeEpic }
      },
      key: 'KD-10655'
    },
    changelog: {
      id: '239390',
      items: [
        {
          field: 'status',
          fieldtype: 'jira',
          from: 'whatever status id',
          fromString: 'Whatever',
          to: jiraStatusDeployed,
          toString: 'Deployed'
        },
        {
          field: 'some_other_field'
        }
      ]
    }
  };

  before(function() {
    this.timeout(4000);
    service = new WebhookService();
    webhook = new Webhook('tickets-to-deployed-after-release');

    sinon.stub(webhook, 'getAllEpicChildren', function(issueKey) {
      return Promise.resolve({
        issues: [
          {
            key: 'KD-1111',
            fields: { status: { id: '12345' } }
          },
          {
            key: 'KD-4444',
            fields: { status: { id: '12345' } }
          },
          {
            key: 'KD-2222',
            fields: { status: { id: '12345' } }
          },
          {
            key: 'KD-3333',
            fields: { status: { id: '12345' } }
          }
        ]
      });
    });

    sinon.stub(webhook, 'doTransition', function(issueKey, transition) {
      if (issueKey == 'KD-4444') {
        // fake jira error which occurs e.g. if the ticket cannot be moved due to wrong current status
        return Promise.reject('Error: 500: Error while updating');
      } else {
        return Promise.resolve({ issueKey: issueKey, request: transition });
      } 
    });

    return service.register(webhook);
  });

  it.skip('Issue that has been moved to deployed should be of type epic', function() {
    return webhook.isEpicMovedToDeployed(validWebhookRequest)
      .then((res) => res.should.equal(true));
  });
  it('Should not be executed because key is missing', function() {
    let request = JSON.parse(JSON.stringify(validWebhookRequest));
    delete request.issue.key;
    return service.invoke(request)
      .then((res) => {
        Object.keys(res.webhookResults).should.have.lengthOf(1);
        res.webhookResults['tickets-to-deployed-after-release'].should.have.property('success', false);
        res.webhookResults['tickets-to-deployed-after-release'].should.have.property('error', 'Invalid request. It should at least contain issue.key');
      })
  });
  it('Should not be executed because issue is not updated', function() {
    let request = JSON.parse(JSON.stringify(validWebhookRequest));
    request.webhookEvent = 'jira:some_other_action';
    return service.invoke(request)
      .then((res) => {
        Object.keys(res.webhookResults).should.have.lengthOf(0);
      });
  });
  it("Should move three of four epic children to 'Deployed'", function() {
    return service.invoke(validWebhookRequest)
      .then((res) => {
        Object.keys(res.webhookResults).should.have.lengthOf(1);
        var webhookResult = res.webhookResults['tickets-to-deployed-after-release'];
        webhookResult.should.have.property('id', 'tickets-to-deployed-after-release');
        webhookResult.should.have.property('success', true);
        webhookResult.should.have.property('result');
        webhookResult.result.should.have.lengthOf(4);
        checkTransition(webhookResult.result[0], 'KD-1111', jiraTransitionDeployed);
        checkTransition(webhookResult.result[2], 'KD-2222', jiraTransitionDeployed);
        checkTransition(webhookResult.result[3], 'KD-3333', jiraTransitionDeployed);
        // KD-4444 could not be moved which should not have affected the other children
        expect(webhookResult.result[1]).to.be.undefined;
      });
  });
});