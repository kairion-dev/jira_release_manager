"use strict";

var
	chai = require('chai'),
	should = chai.should(),
	Promise = require('bluebird'),
	config = require('config'),
	Git = require('nodegit'),
	GitHistory = require('../../lib/git.js').GitHistory,
	moment = require('moment'),
	db = require('../../lib/db.js').db(config), // init database with testing environment configs...
	releases = require('../../models/releases.js'); // ... so that models will work upon the corresponding databases (internally)

chai.use(require('chai-things')); // to test array elements with chai

// TODO create helper lib for all tests (models/releases, startup/tags, etc.)
function arrayToObject(array, key) {
	return array.reduce((obj, current) => {
		obj[current[key]] = current;
		return obj;
	}, {});
}


var RepositoryGenerator = require('../helper/generateRepositories.js').RepositoryGenerator;
var path = 'tests/data/repositories/testrepo1';


before(function() {

	var Generator = new RepositoryGenerator(path);
	var branches = [ 'develop', 'feature/feature1', 'feature/feature2', 'feature/feature3' ];

	return db['tags'].removeAsync({}, { multi: true })
		.then(() => Generator.init(branches, Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-26 00:00:00').unix(), 120)))
		.then(() => Generator.switchToBranch('feature/feature2'))
		.then(() => Generator.createCommit([ 'file2.txt' ], Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-28 02:02:20').unix(), 120), 'KD-2222 commit message 2'))
		.then(() => Generator.switchToBranch('feature/feature3'))
		.then(() => Generator.createCommit([ ], Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-29 03:03:30').unix(), 120), 'KD-3333 commit message 3'))
		.then(() => Generator.createCommit([ ], Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-28 04:04:40').unix(), 120), 'KD-4444 commit message 4'))
		.then((commitId) => Generator.repo.createTag(commitId, '16.01.1', 'Message for tag: 16.01.1!'))
		.catch((e) => {
			console.log(e);
		})
})


describe('test', function() {
	var configId = 'testgit';
	var options = {
    path: config.get('git.repositories.' + configId + '.path'),
    name: config.get('git.repositories.' + configId + '.name'),
    feature_prefix: config.get('git.featurePrefix')
  };
  var git = new GitHistory(options, db);
	it('first tag, should contain two tickets', function() {
		return git.initialize()
			.then((tags) => {
				console.log(tags);
				return db.tags.findAsync({ type: 'release' })
			})
			.then((docs) => {
				// should contain two tickets from the commits
				docs.should.have.lengthOf(1);
				var doc = docs[0];
				doc.tag.should.equal('16.01.1');
				doc.repository.should.equal('testgit');
				doc.tickets.should.contain('KD-3333');
				doc.tickets.should.contain('KD-4444');
				doc.commits.should.equal(3);
			})
	});
	it('second tag should only show differences to first tag', function() {
		var Generator = new RepositoryGenerator(path);
		return Generator.open()
			.then(() => Generator.createCommit([ ], Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-30 00:00:00').unix(), 120), 'KD-5555 commit message 5'))
			.then((commitId) => Generator.repo.createTag(commitId, '16.01.2', 'Message for tag: 16.01.2!'))
			.then(() => git.initialize())
			.then(() => db.tags.findAsync({ type: 'release' }))
			.then((docs) => {
				docs.should.have.lengthOf(2);
				docs = arrayToObject(docs, 'tag');
				// should contain the same values as before
				var doc = docs['16.01.1'];
				doc.tag.should.equal('16.01.1');
				doc.repository.should.equal('testgit');
				doc.tickets.should.contain('KD-3333');
				doc.tickets.should.contain('KD-4444');
				doc.commits.should.equal(3);
				// should contain the differences to the first tag, that means one commit with ticket KD-5555
				doc = docs['16.01.2'];
				doc.tag.should.equal('16.01.2');
				doc.repository.should.equal('testgit');
				doc.tickets.should.contain('KD-5555');
				doc.commits.should.equal(1);
			})
	});
});

