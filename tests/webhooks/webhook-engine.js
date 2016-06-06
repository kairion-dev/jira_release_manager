"use strict";

var
  chai = require('chai'),
  should = chai.should(),
  Promise = require('bluebird'),
  db = require('../../lib/db.js').db(),
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
      return engine.register(new Webhook('webhook1'))
        .then(() => engine.invoke('Hello World'))
        .then((results) => {
          results.should.have.lengthOf(1);
          results[0].result.should.equal('Hello World');
        });
    });
    it('Webhook engine should also work fine by passing webhooks via constructor config', function() {
      let config = { 'helloWorld': webhookPaths.helloWorld };
      return engine.registerByConfig(config)
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
      return engine.register(new Webhook('webhook1', { prefix: 'Prefix before Hello World: ' }))
        .then(() => engine.invoke('Hello World'))
        .then((results) => {
          results.should.have.lengthOf(1);
          results[0].result.should.equal('Prefix before Hello World: Hello World');
        });
    });
    it('Webhook should not be invoked', function() {
      let Webhook = require('./webhooks/hello-world');
      return engine.register(new Webhook('webhook1'))
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

      return engine.registerByConfig(config) // register two webhooks by using the config
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