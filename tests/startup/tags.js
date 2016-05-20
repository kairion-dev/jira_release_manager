"use strict";

var
	chai = require('chai'),
	should = chai.should(),
	Promise = require('bluebird'),
	config = require('config'),
	helper = require('../helper/common.js'),
	Git = require('nodegit'),
	GitHistory = require('../../lib/git.js').GitHistory,
	moment = require('moment'),
	db = require('../../lib/db.js').db(config), // init database with testing environment configs...
	releases = require('../../models/tags.js')('release'); // ... so that models will work upon the corresponding databases (internally)

chai.use(require('chai-things')); // to test array elements with chai


var repoId = 'testgit';
var options = {
  path: config.get('git.repositories.' + repoId + '.path'),
  name: config.get('git.repositories.' + repoId + '.name'),
  feature_prefix: config.get('git.featurePrefix')
};
// init library to generate test repositories
var RepositoryGenerator = require('../helper/repositoryGenerator.js').RepositoryGenerator;
var Generator = new RepositoryGenerator(options.path);
// init git library for testing
var git = new GitHistory(options, db);


describe('check repository initializing for tags', function() {
	before(function() {
		var branches = [ 'develop', 'feature/feature1', 'feature/feature2', 'feature/feature3' ];
		return db['tags'].removeAsync({}, { multi: true })
			.then(() => Generator.init(branches, Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-26 00:00:00').unix(), 120)))
			.then(() => Generator.switchToBranch('feature/feature1'))
			.then(() => Generator.createCommit([ ], Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-28 01:04:00').unix(), 120), 'KD-1111 commit message 1'))
			.then(() => Generator.switchToBranch('feature/feature2'))
			.then(() => Generator.createCommit([ ], Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-28 02:02:20').unix(), 120), 'KD-2222 commit message 2'))
			.then(() => Generator.switchToBranch('feature/feature3'))
			.then(() => Generator.createCommit([ ], Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-29 03:03:30').unix(), 120), 'KD-3333 commit message 3'))
			.then(() => Generator.createCommit([ ], Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-28 04:04:40').unix(), 120), 'KD-4444 commit message 4'))
			.then(() => Generator.mergeBranches('develop', 'feature/feature3', Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-29 17:10:00').unix(), 120)))
			//.then(() => Generator.mergeBranches('develop', 'feature/feature3', Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-29 17:20:00').unix(), 120)))
			.then((commitId) => Generator.repo.createTag(commitId, '16.01.1', 'Message for tag: 16.01.1'))
			.catch((e) => {
				console.log(e);
			})
	})
	it('first release tag, should contain two tickets', function() {
		return git.initialize()
			.then((tags) => db.tags.findAsync({ type: 'release' }))
			.then((docs) => {
				// should contain two tickets from the commits
				docs.should.have.lengthOf(2); // master and 16.01.1
				docs = helper.arrayToObject(docs, 'tag');
				var doc = docs['16.01.1'];
				doc.tag.should.equal('16.01.1');
				doc.repository.should.equal('testgit');
				doc.tickets.should.contain('KD-3333');
				doc.tickets.should.contain('KD-4444');
				doc.commits.should.equal(3);
			})
	});
	it('second release tag should only show differences to first tag', function() {
		return Generator.mergeBranches('develop', 'feature/feature2') // merge second branch that was opened before the third, but was not in the last release tag
			.then((commitId) => Generator.repo.createTag(commitId, '16.01.2', 'Message for tag: 16.01.2'))
			.then(() => git.initialize()) // init git again to load updates in the repository
			.then(() => db.tags.findAsync({ type: 'release' }))
			.then((docs) => {
				docs.should.have.lengthOf(3); // master, 16.01.1, 16.01.2
				docs = helper.arrayToObject(docs, 'tag');
				// should contain the same values as before
				var doc = docs['16.01.1'];
				doc.tag.should.equal('16.01.1');
				doc.repository.should.equal('testgit');
				doc.tickets.should.contain('KD-3333');
				doc.tickets.should.contain('KD-4444');
				doc.commits.should.equal(3); // 2 commits + initial commit
				// should contain the differences to the first tag, that means one commit with ticket KD-5555
				doc = docs['16.01.2'];
				doc.tag.should.equal('16.01.2');
				doc.repository.should.equal('testgit');
				doc.tickets.should.contain('KD-2222');
				doc.commits.should.equal(2); // 1 commit + initial commit
			})
	});
	it('add third release tag with new commits', function() {
		return Generator.switchToBranch('develop')
			.then(() => Generator.createCommit([ ], Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-30 05:00:00').unix(), 120), 'KD-6666 commit message 6'))
			.then(() => Generator.mergeBranches('develop', 'feature/feature1'))
			.then((commitId) => Generator.repo.createTag(commitId, '16.01.3', ''))
			.then(() => git.initialize()) // init git again to load updates in the repository
			.then(() => db.tags.findAsync({ type: 'release' }))
			.then((docs) => {
				docs.should.have.lengthOf(4); // master, 16.01.1, 16.01.2, 16.01.3
				docs = helper.arrayToObject(docs, 'tag');
				var doc = docs['16.01.3'];
				doc.tag.should.equal('16.01.3');
				doc.repository.should.equal('testgit');
				doc.tickets.should.contain('KD-1111');
				doc.tickets.should.contain('KD-6666');
				doc.commits.should.equal(3); // 2 commits + initial commit
			});
	});
});


describe('test git log and message parsing', function() {

	var commitId = {};

	before(function() {
		var author = Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-26 12:12:12').unix(), 120);
		return Generator.init([], author)
			.then(() => {
				return Generator.createCommit([], author, 'message\nover\nmultiple\n\n\nlines\ryeah!\r\r');
			})
			.then((id) => {
				commitId.newLines = id;
				return Generator.createCommit([], author, '"quotes" should not " break "" anything');
			})
			.then((id) => {
				commitId.quotes = id;
				return Generator.createCommit([], author, 'i got \\s \\\\ in my message \\');
			})
			.then((id) => {
				commitId.backslash = id;
				return Generator.createCommit([], author, '\t\t and also \t tabs');
			})
			.then((id) => {
				commitId.tabs = id;
				return Generator.repo.createTag(id, 'tag', '');
			});
	});
	it('check multiple lines, backslashes, tabs and quotes', function() {
		return git.gitLog('tag')
			.then((commits) => {
				commits = helper.arrayToObject(commits, 'id');
				commits[commitId.newLines].message.should.equal('message\nover\nmultiple\n\n\nlines\nyeah!\n\n');
				commits[commitId.backslash].message.should.equal('i got \\s \\\\ in my message \\');
				commits[commitId.tabs].message.should.equal('\t\t and also \t tabs');
				commits[commitId.quotes].message.should.equal('"quotes" should not " break "" anything');
			});
	});
});


describe('check next release', function() {
	before(function() {
		var branches = [ 'develop', 'feature/feature1', 'feature/feature2', 'feature/feature3' ];
		return db['tags'].removeAsync({}, { multi: true })
			.then(() => Generator.init(branches, Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-26 00:00:00').unix(), 120)))
			.then(() => Generator.switchToBranch('feature/feature1'))
			.then(() => Generator.createCommit([ ], Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-28 01:04:00').unix(), 120), 'KD-1111 commit message 1'))
			.then(() => Generator.mergeBranches('develop', 'feature/feature1', Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-29 17:10:00').unix(), 120)))
			.catch((e) => {
				console.log(e);
			})
	})
	it('ticket from feature1 should be in next release', function() {
		return git.initialize()
			.then((tags) => db.tags.findAsync({ type: 'release' }))
			.then((docs) => {
				docs.should.have.lengthOf(1);
				docs = helper.arrayToObject(docs, 'tag');
				var nextRelease = docs['Next Release'];
				nextRelease.tickets.should.have.lengthOf(1);
				nextRelease.tickets.should.contain('KD-1111');
			})
	});
	it('still should be one ticket in next release cause feature2 is not merged yet', function() {
		return Generator.switchToBranch('feature/feature2')
			.then(() => Generator.createCommit([ ], Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-28 02:02:20').unix(), 120), 'KD-2222 commit message 2'))
			.then(() => Generator.createCommit([ ], Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-29 03:03:30').unix(), 120), 'KD-3333 commit message 3'))
			.then(() => git.initialize())
			.then((tags) => db.tags.findAsync({ type: 'release' }))
			.then((docs) => {
				docs.should.have.lengthOf(1);
				docs = helper.arrayToObject(docs, 'tag');
				var nextRelease = docs['Next Release'];
				nextRelease.tickets.should.have.lengthOf(1);
				nextRelease.tickets.should.contain('KD-1111');
			})
	});
	it('after merging feature2 there should be three tickets now', function() {
		return Generator.mergeBranches('develop', 'feature/feature2') // now merge feature2
			.then(() => git.initialize())
			.then((tags) => db.tags.findAsync({ type: 'release' }))
			.then((docs) => {
				docs.should.have.lengthOf(1);
				docs = helper.arrayToObject(docs, 'tag');
				var nextRelease = docs['Next Release'];
				nextRelease.tickets.should.have.lengthOf(3);
				nextRelease.tickets.should.contain('KD-1111');
				nextRelease.tickets.should.contain('KD-2222');
				nextRelease.tickets.should.contain('KD-3333');
			})
	});
	it('next release should not exist any more after release but new tag should be visible', function() {
		return Generator.mergeBranches('master', 'develop') // as soon as develop is merged in master the release is complete
			.then((commitId) => Generator.repo.createTag(commitId, '16.01.1', 'Message for tag: 16.01.1'))
			.then(() => git.initialize())
			.then((tags) => db.tags.findAsync({ type: 'release' }))
			.then((docs) => {
				docs.should.have.lengthOf(1);
				docs = helper.arrayToObject(docs, 'tag');
				var tag = docs['16.01.1'];
				tag.tickets.should.have.lengthOf(3);
				tag.tickets.should.contain('KD-1111');
				tag.tickets.should.contain('KD-2222');
				tag.tickets.should.contain('KD-3333');
			})
	});
	it('next release should only show new changes from feature3', function() {
		return Generator.switchToBranch('feature/feature3')
			.then(() => Generator.createCommit([ ], Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-28 04:04:40').unix(), 120), 'KD-4444 commit message 4'))
			.then(() => Generator.mergeBranches('develop', 'feature/feature3'))
			.then(() => git.initialize())
			.then((tags) => db.tags.findAsync({ type: 'release' }))
			.then((docs) => {
				docs.should.have.lengthOf(2);
				docs = helper.arrayToObject(docs, 'tag');
				var tag = docs['16.01.1'];
				tag.tickets.should.have.lengthOf(3);
				tag.tickets.should.contain('KD-1111');
				tag.tickets.should.contain('KD-2222');
				tag.tickets.should.contain('KD-3333');
				var nextRelease = docs['Next Release'];
				nextRelease.tickets.should.have.lengthOf(1);
				nextRelease.tickets.should.contain('KD-4444');
			})
	});
});


describe('check repository initializing for open branches', function() {
	before(function() {
		var branches = [ 'develop', 'feature/feature1', 'feature/feature2', 'feature/feature3' ];
		return db['tags'].removeAsync({}, { multi: true })
			.then(() => Generator.init(branches, Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-26 00:00:00').unix(), 120)))
			.then(() => Generator.switchToBranch('feature/feature1'))
			.then(() => Generator.createCommit([ ], Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-28 01:04:00').unix(), 120), 'KD-1111 commit message 1'))
			.then(() => Generator.switchToBranch('feature/feature2'))
			.then(() => Generator.createCommit([ ], Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-28 02:02:20').unix(), 120), 'KD-2222 commit message 2'))
			.then(() => Generator.switchToBranch('feature/feature3'))
			.then(() => Generator.createCommit([ ], Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-29 03:03:30').unix(), 120), 'KD-3333 commit message 3'))
			.then(() => Generator.createCommit([ ], Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-28 04:04:40').unix(), 120), 'KD-4444 commit message 4'));
	})
	it('should contain all three branches cause none of them was closed', function() {
		return git.initialize()
			.then((tags) => db.tags.findAsync({ type: 'branch' }))
			.then((docs) => {
				docs.should.have.lengthOf(3);
				docs = helper.arrayToObject(docs, 'tag');
				docs.feature1.commits.should.equal(1);
				docs.feature1.tickets.should.contain('KD-1111');
				docs.feature2.commits.should.equal(1);
				docs.feature2.tickets.should.contain('KD-2222');
				docs.feature3.commits.should.equal(2);
				docs.feature3.tickets.should.contain('KD-3333');
				docs.feature3.tickets.should.contain('KD-4444');
			});
	});
	it('should only contain feature1 and feature3 as open branches cause feature2 was closed', function() {
		return Generator.mergeBranches('develop', 'feature/feature2')
			.then(() => git.initialize())
			.then((tags) => db.tags.findAsync({ type: 'branch' }))
			.then((docs) => {
				docs.should.have.lengthOf(2);
				docs = helper.arrayToObject(docs, 'tag');
				docs.feature1.commits.should.equal(1);
				docs.feature1.tickets.should.contain('KD-1111');
				docs.feature3.commits.should.equal(2);
				docs.feature3.tickets.should.contain('KD-3333');
				docs.feature3.tickets.should.contain('KD-4444');
			});
	});
	it('updating open branches while startup (which means deleting and reloading all open branches) should not affect release tags', function() {
		return Generator.mergeBranches('master', 'develop')
			.then((commitId) => Generator.repo.createTag(commitId, '14.04.4', 'Message for tag: 14.04.4'))
			.then(() => git.initialize())
			.then((tags) => db.tags.findAsync({ type: 'branch' }))
			.then((docs) => {
				docs.should.have.lengthOf(2);
				docs = helper.arrayToObject(docs, 'tag');
				docs.feature1.commits.should.equal(1);
				docs.feature1.tickets.should.contain('KD-1111');
				docs.feature3.commits.should.equal(2);
				docs.feature3.tickets.should.contain('KD-3333');
				docs.feature3.tickets.should.contain('KD-4444');
			})
			.then(() => db.tags.findAsync({ type: 'release' }))
			.then((docs) => {
				docs.should.have.lengthOf(1);
				docs = helper.arrayToObject(docs, 'tag');
				docs['14.04.4'].tickets.should.contain('KD-2222');
			});
	});
	it.skip('test with another closed feature', function() {
		//TODO
	});
	it.skip('test whats happens when a release tag is generated', function() {
		//TODO
		// .then((commitId) => Generator.repo.createTag(commitId, '16.01.1', 'Message for tag: 16.01.1'))
	});
});