"use strict";

var
  chai = require('chai'),
  should = chai.should(),
  expect = chai.expect,
  Promise = require('bluebird'),
  db = require('../../lib/db.js').db(),
  WebhookService = require('../../lib/webhook-service.js'),
  WebhookEngine = require('../../lib/webhook-engine.js'),
  helper = require('../helper/common.js');

var webhookPaths = {
  'hello_world' : { path: '../tests/webhooks/webhooks/hello-world'},
  'calc_add' : { path: '../tests/webhooks/webhooks/calculator', params: { operation: function(a,b) { return a + b } }}
}


describe('Webhook Service', function() {
  var service;
  beforeEach(function() {
    service = new WebhookService();
  });
  describe('Basics', function() {
    it('Webhook hello_world should start up and work without any error', function() {
      let Webhook = require('./webhooks/hello-world');
      return service.register(new Webhook('webhook1'))
        .then(() => service.invoke('Hello World'))
        .then((res) => {
          Object.keys(res.webhookResults).should.have.lengthOf(1);
          res.webhookResults['webhook1'].result.should.equal('Hello World');
        });
    });
    it('Webhook service should also work fine by passing webhooks via constructor config', function() {
      let config = { 'hello_world': webhookPaths.hello_world };
      return service.registerByConfig(config)
        .then(() => service.invoke('Hello World by config'))
        .then((res) => {
          Object.keys(res.webhookResults).should.have.lengthOf(1);
          res.webhookResults['hello_world'].result.should.equal('Hello World by config');
        });
    });
  });
  describe('Webhook structure and logic', function() {
    it('Data passed by webhook constructor should be processed', function() {
      let Webhook = require('./webhooks/hello-world');
      return service.register(new Webhook('webhook1', { prefix: 'Prefix before Hello World: ' }))
        .then(() => service.invoke('Hello World'))
        .then((res) => {
          Object.keys(res.webhookResults).should.have.lengthOf(1);
          res.webhookResults['webhook1'].result.should.equal('Prefix before Hello World: Hello World');
        });
    });
    it('Webhook should not be invoked', function() {
      let Webhook = require('./webhooks/hello-world');
      return service.register(new Webhook('webhook1'))
        // HelloWorldWebhook should be not executed when request equals 'dont execute'
        .then(() => service.invoke('dont execute'))
        .then((res) => {
          Object.keys(res.webhookResults).should.have.lengthOf(0);
        });
    });
    it('Engine should work fine with multiple webhooks of different types', function() {
      let config = { 'hello_world': webhookPaths.hello_world, 'calc_add': webhookPaths.calc_add };
      let Calculator = require('./webhooks/calculator');
      let calcMult = new Calculator('calc_mult', { operation: function(a,b) { return a * b; } });

      let request = { a: 5, b: 3 };

      return service.registerByConfig(config) // register two webhooks by using the config
        .then(() => service.register(calcMult)) // and add another one manually
        .then(() => service.invoke(request))
        .then((res) => {
          Object.keys(res.webhookResults).should.have.lengthOf(3); // we expect results from both webhooks
          res.webhookResults['hello_world'].result.should.deep.equal(request);
          res.webhookResults['calc_add'].result.should.equal(8); // 5 + 3
          res.webhookResults['calc_mult'].result.should.equal(15); // 5 * 3
        })
    });
  });
  describe('Webhook Details', function() {
    it('Should have well-formed structure', function() {
      return db.webhooks.removeAsync({}, { multi: true })
        .then(() => service.registerByConfig(webhookPaths))
        .then(() => service.invoke({ a: 4 , b: 2 }))
        .then(() => service.getWebhooksData())
        .then((res) => {
          Object.keys(res).should.have.lengthOf(2);
          res['hello_world'].should.have.property('params');
          res['hello_world'].should.have.property('data');
          res['hello_world'].data.should.have.property('invoked');
          res['hello_world'].data.should.have.property('errors');
          res['hello_world'].data.should.have.property('last_time_invoked');
        })
    });
    it('Should have correct number of invokes and errors', function() {
      let Calculator = require('./webhooks/calculator');
      let calcFail = new Calculator('calc_fail', { });
      let timestamp1, timestamp2;
      return db.webhooks.removeAsync({}, { multi: true })
        .then(() => service.registerByConfig(webhookPaths))
        .then(() => service.invoke({ a: 4 , b: 2 }))
        .then((res) => { timestamp1 = new Date(res.timestamp).toString(); })
        .then(() => service.getWebhooksData())
        // both webhooks should have been invoked successfully
        .then((res) => {
          Object.keys(res).should.have.lengthOf(2);
          res['hello_world'].data.invoked.should.equal(1);
          res['hello_world'].data.errors.should.equal(0);
          res['hello_world'].data.last_time_invoked.should.equal(timestamp1);
          res['calc_add'].data.invoked.should.equal(1);
          res['calc_add'].data.errors.should.equal(0);
          res['calc_add'].data.last_time_invoked.should.equal(timestamp1);
        })
        // 'hello_world' webhook should not be invoked, but 'calc_add'
        .then(() => {
          return new Promise((resolve, reject) => {
            // just wait for it ...
            setTimeout(function() {
              service.invoke('dont execute')
                .then((res) => {
                  // save new timestamp that is at least one second higher
                  timestamp2 = new Date(res.timestamp).toString();
                  resolve();
                })
            }, 1000);
          })
        })
        .then(() => service.getWebhooksData())
        .then((res) => {
          Object.keys(res).should.have.lengthOf(2);
          res['hello_world'].data.invoked.should.equal(1);
          res['hello_world'].data.errors.should.equal(0);
          // 'hello_world' still should have the old timestamp cause it was not invoked again
          res['hello_world'].data.last_time_invoked.should.equal(timestamp1);
          res['calc_add'].data.invoked.should.equal(2);
          res['calc_add'].data.errors.should.equal(0);
          // 'calc_add' should have the new timestamp
          res['calc_add'].data.last_time_invoked.should.equal(timestamp2);
        })
        // now we add another calc webhook that has no operation and thus will fail miserably
        .then(() => service.register(calcFail))
        .then(() => service.invoke({ a: 3 , b: 3 }))
        .then(() => service.getWebhooksData())
        .then((res) => {
          // we should have data for 3 webhooks now
          Object.keys(res).should.have.lengthOf(3);
          // both old webhooks should be executed as usual
          res['hello_world'].data.invoked.should.equal(2);
          res['hello_world'].data.errors.should.equal(0);
          res['calc_add'].data.invoked.should.equal(3);
          res['calc_add'].data.errors.should.equal(0);
          // the new 'calc_fail' webhook should fail due to the missing operation function that is called nonetheless
          res['calc_fail'].data.invoked.should.equal(1);
          res['calc_fail'].data.errors.should.equal(1);
        })
    });
  })
});

describe('Webhook Engine', function() {
  var engine;
  // helper function to test new services
  var checkServices = function(engine) {
    engine.should.have.property('services');
    Object.keys(engine.services).should.have.lengthOf(2);
    let service = engine.services['jira'];
    service.should.have.property('webhooks');
    service.webhooks.should.have.property('hello_world');
    service.webhooks.should.have.property('calc_add');
    service = engine.services['bitbucket'];
    service.should.have.property('webhooks');
    service.webhooks.should.have.property('hello_world');
    service.webhooks.should.have.property('calc_add');
  };
  // testing
  it('Manually create services', function() {
    engine = new WebhookEngine();
    engine.newService('jira', '/jira', webhookPaths);
    engine.newService('bitbucket', '/bitbucket', webhookPaths);
    checkServices(engine);
  });
  it('Using the config should result in the same services', function() {
    engine = new WebhookEngine();
    let config = { 'jira': webhookPaths, 'bitbucket': webhookPaths };
    engine.init(config);
    checkServices(engine);
  });
  it('No service cause initializing should result in an error', function() {
    engine = new WebhookEngine();
    expect(function() {
      return engine.init();
    }).to.throw('No webhook service registered. Please use WebhookEngine.newService() or provide a config in WebhookEngine.init()');
  });
});