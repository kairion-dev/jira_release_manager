"use strict";

var
  chai = require('chai'),
  should = chai.should(),
  expect = chai.expect,
  Promise = require('bluebird'),
  config = require('config'),
  db = require('../../lib/db.js').db(),
  WebhookService = require('../../lib/webhook-service.js'),
  Git = require('nodegit'),
  moment = require('moment'),
  Core = require('../../lib/core.js'),
  helper = require('../helper/common.js');


var service;
var repoId = 'testgit';


// init library to generate and change repositories
var RepositoryGenerator = require('../helper/repositoryGenerator.js').RepositoryGenerator;
// get local and remote generator
var Generator1 = new RepositoryGenerator(config.get('git.repositories.' + repoId + '.path'));
var GeneratorRemote = new RepositoryGenerator(__dirname + '/.repositories/remote/.git');
var author = Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-26 00:00:00').unix(), 120);


var core = new Core();

// we currently add the tickets before pulling the tags in order to not connect to JIRA (we only want to test Bitbucket here)
var tickets1 = [
  {"key":"KD-1111","project":"KD","summary":"ai doc-update","status":"Deployed","issueType":"Sub-task","assignee":"Tomasz Porst","components":[],"parent":false,"newCap":false},
]


beforeEach(function() {
  service = new WebhookService();
  return Generator1.init(['develop'], author)
  .then(() => GeneratorRemote.init(['develop'], author, 1)) // currently a repo can only be pushed into a remote bare
  .then(() => Generator1.createRemote('file://' + GeneratorRemote.path))
  .then(() => db.tags.removeAsync({}, { multi: true }))
  .then(() => db.tickets.removeAsync({}, { multi: true }))
  .then(() => db.tickets.insertAsync(tickets1[0])); // already insert tickets before we pull new tags (that contain these tickets)
});


describe("Webhook 'Create Tag'", function() {
  describe('Basics', function() {
    it('should not be called on empty request', function() {
      return service.registerByConfig(config.get('webhooks.bitbucket'))
        .then(() => service.invoke())
        .then((res) => {
          Object.keys(res.webhookResults).should.have.lengthOf(0);
        });
    });
    it('should fail if no repository name is defined in request', function() {
      return service.registerByConfig(config.get('webhooks.bitbucket'))
        .then(() => service.invoke({ push: { what: 'ever' }}))
        .then((res) => {
          Object.keys(res.webhookResults).should.have.lengthOf(1);
          res.webhookResults['create-tag'].should.have.property('success');
          res.webhookResults['create-tag'].success.should.equal(false);
          res.webhookResults['create-tag'].should.have.property('error');
          res.webhookResults['create-tag'].error.should.equal('data.repository.name must be defined');
        });
    });
    it('should fail if repository name is not known in configs', function() {
      return service.registerByConfig(config.get('webhooks.bitbucket'))
        .then(() => service.invoke({ push: { what: 'ever' }, repository: { name: 'invalid_repo' } }))
        .then((res) => {
          Object.keys(res.webhookResults).should.have.lengthOf(1);
          res.webhookResults['create-tag'].should.have.property('success');
          res.webhookResults['create-tag'].success.should.equal(false);
          res.webhookResults['create-tag'].should.have.property('error');
          res.webhookResults['create-tag'].error.should.equal("config does not contain a repository called 'invalid_repo'");
        });
    });
  });
  describe('Check with remote repository', function() {
    it('release tags should be empty at the beginning', function() {
      return core.initRepository(repoId)
        .then(() => db.tags.findAsync({ type: 'release' }))
        .then((docs) => docs.should.be.empty);
    });
    it('pull new tag manually and check for existence', function() {
      return GeneratorRemote.createCommit([], author, 'KD-1111 commit 1')
        .then((commit) => GeneratorRemote.repo.createTag(commit, '17.07.7', ''))
        .then(() => Generator1.pull('master'))
        .then(() => core.initRepository(repoId))
        .then(() => db.tags.findAsync({ type: 'release' }))
        .then((docs) => {
          docs.should.have.lengthOf(1);
          var doc = docs[0];
          doc.tag.should.equal('17.07.7');
          doc.tickets.should.contain('KD-1111');
        })
    });
    it('do the same but this time by calling the create-tag webhook', function() {
      return core.initRepository(repoId)
        .then(() => db.tags.findAsync({ type: 'release' }))
        .then((docs) => docs.should.be.empty) // again no release tags expected before pull
        .then(() => GeneratorRemote.createCommit([], author, 'KD-1111 commit 1'))
        .then((commit) => GeneratorRemote.repo.createTag(commit, '17.07.7', ''))
        .then(() => Generator1.pull('master'))
        .then(() => service.registerByConfig(config.get('webhooks.bitbucket')))
        .then(() => service.invoke({
          repository: {
            name: 'testgit'
          },
          push: {
            what: 'ever'
          }
        }))
        .then(() => db.tags.findAsync({ type: 'release' }))
        .then((docs) => {
          docs.should.have.lengthOf(1);
          var doc = docs[0];
          doc.tag.should.equal('17.07.7');
          doc.tickets.should.contain('KD-1111');
        })
    });
  });
});