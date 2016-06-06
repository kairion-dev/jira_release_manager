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
  Webhook = require('../../webhooks/develop-on-timetracking.js'),
  sinon = require('sinon'),
  helper = require('../helper/common.js');

require('sinon-as-promised');

var core = new Core();

var jiraStatusNotPlanned = '10307';
var jiraTransitionSelectedForDevelopment = '911';


describe("Webhook 'Status To Development On Timetracking'", function() {
  var webhook;
  var engine;

  var validWebhookRequest = {
    webhookEvent: 'jira:issue_updated',
    issue: {
      key: 'KD-10035',
      fields: {
        timespent: 1,
        status: {
          id: jiraStatusNotPlanned
        }
      }
    }
  };

  before(function() {
    this.timeout(4000);
    engine = new WebhookEngine();
    webhook = new Webhook('develop-on-timetracking');

    sinon.stub(webhook, 'doTransition', function(issueKey, transition) {
      return Promise.resolve({ issueKey: issueKey, request: transition });
    });

    return engine.register(webhook);
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
  it('Should not be executed because no time tracking', function() {
    let request = JSON.parse(JSON.stringify(validWebhookRequest));
    request.issue.fields.timespent = null;
    return engine.invoke(request)
      .then((res) => {
        res.should.have.lengthOf(1);
        expect(res[0]).to.be.undefined;

        request.issue.fields.timespent = 0;
        return engine.invoke(request);
      })
      .then((res) => {
        res.should.have.lengthOf(1);
        expect(res[0]).to.be.undefined;
      });
  });
  it("Should not be executed because issue status is not on 'Not planned'", function() {
    let request = JSON.parse(JSON.stringify(validWebhookRequest));
    request.issue.fields.status.id = '12345';
    return engine.invoke(request)
      .then((res) => {
        res.should.have.lengthOf(1);
        expect(res[0]).to.be.undefined;
      });
  });
  it("Should set status to 'Selected for development' when time is tracked on unplanned ticket", function() {
    return engine.invoke(validWebhookRequest)
      .then((res) => {
        res.should.have.lengthOf(1);
        res[0].should.have.property('id', 'develop-on-timetracking');
        res[0].should.have.property('success', true);
        res[0].should.have.property('result');
        res[0].result.should.have.property('issueKey', 'KD-10035');
        res[0].result.should.have.property('request');
        res[0].result.request.should.have.property('transition');
        res[0].result.request.transition.should.have.property('id', '911');
      });
  });
});