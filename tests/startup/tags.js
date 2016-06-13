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
	db = require('../../lib/db.js').db(),
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

describe('Check basics of git library', function() {
  it('Test storeTag()', function() {
    var data = {
      tag: '14.02.1',
      commits: [
        {
          id: '2cc62f053abd58016df5d6e7d8ee491cc963cf5a',
          author: 'Karl-Heinz',
          date: 'Thu Dec 4 13:31:02 2014 +0100',
          message: 'KD-1234 some commit'
        },
        {
          id: '12345f053abd58016df5d6e7d8ee491cc963cf5a',
          author: 'Karl-Heinz',
          date: 'Thu Dec 4 14:30:00 2014 +0100',
          message: 'KD-0 quick fix'
        },
        {
          id: 'eef34f053abd58016df5d6e7d8ee491cc963cf5a',
          author: 'Karl-Heinz',
          date: 'Thu Dec 4 15:30:00 2014 +0100',
          message: 'no KD-XXXX in the message'
        },
        {
          id: '2ccaaaa53abd58016df5d6e7d8ee491cc963cf5a',
          author: 'Operator',
          date: 'Thu Dec 4 16:30:00 2014 +0100',
          message: 'KDO-123 business, busi, bu!'
        },
        {
          id: '123457253abd58016df5d6e7d8ee491cc963cf5a',
          author: 'Thomas',
          date: 'Thu Dec 4 17:30:00 2014 +0100',
          message: 'Merge branch feature/myFeauture into develop\n'
        }
      ],
      type: 'release'
    };
    return db['tags'].removeAsync({}, { multi: true })
      .then(() => git.storeTag(data.tag, data.commits, data.type))
      .then(() => db.tags.findAsync({ type: 'release' }))
      .then((docs) => {
        docs.should.have.lengthOf(1); // one new tag should be inserted in db
        var doc = docs[0];
        doc.should.have.property('tickets');
        doc.tickets.should.have.lengthOf(4);
        doc.tickets.should.contain('KD-1234');
        doc.tickets.should.contain('KD-0 quick fix');
        doc.tickets.should.contain('KD-0 no KD-XXXX in the message');
        doc.tickets.should.contain('KDO-123');
        doc.commits.should.equal(4);
        doc.merges.should.equal(1); // one branch is merged
      });
  });
  describe("Check 'manual changes'", function() {
    it("Test extractManualChanges()", function() {
      var commitMsg, res;

      commitMsg = 'KD-1234 whatever';
      res = git.extractManualChanges(commitMsg);
      res.should.have.property('commitMessage');
      res.should.have.property('manualChanges');
      res.manualChanges.should.have.lengthOf(0);
      res.commitMessage.should.equal(commitMsg);

      commitMsg = 'KD-1234 whatever without manualchange: cause not at the beginning of a new line';
      res = git.extractManualChanges(commitMsg);
      res.manualChanges.should.have.lengthOf(0);
      res.commitMessage.should.equal(commitMsg);

      commitMsg = 'KD-1234 whatever with a \nmanualchange: this is cool, test, 123, %&§, manualchange: i\'m happy ;)';
      res = git.extractManualChanges(commitMsg);
      res.manualChanges.should.have.lengthOf(1);
      res.manualChanges[0].should.equal('this is cool, test, 123, %&§, manualchange: i\'m happy ;)');
      res.commitMessage.should.equal('KD-1234 whatever with a ');

      commitMsg = 'KD-1234 \nmanualchange: a manual change ends \n by the end of the line';
      res = git.extractManualChanges(commitMsg);
      res.manualChanges.should.have.lengthOf(1);
      res.manualChanges[0].should.equal('a manual change ends');
      res.commitMessage.should.equal('KD-1234 \n by the end of the line');

      commitMsg = 'manualchange: and it can not be at the beginning of the commit message (this way we also ensure a KD-xxxx)';
      res = git.extractManualChanges(commitMsg);
      res.manualChanges.should.have.lengthOf(0);
      res.commitMessage.should.equal(commitMsg);

      commitMsg = 'KD-2345 whatever plus\nmanualchange: a manual change which should be shown on the release page\nmanualchange:this one too ;)\nmanualchange:    and \t the  last one   ';
      res = git.extractManualChanges(commitMsg);
      res.manualChanges.should.have.lengthOf(3);
      res.manualChanges[0].should.equal('a manual change which should be shown on the release page');
      res.manualChanges[1].should.equal('this one too ;)');
      res.manualChanges[2].should.equal('and \t the  last one');
      res.commitMessage.should.equal('KD-2345 whatever plus');
    });
    it("Test storeTag() with commits containing manual changes", function() {
      var data = {
        tag: '14.02.2',
        commits: [
          {
            id: '2cc62f053abd58016df5d6e7d8ee491cc963cf5a',
            author: 'Karl-Heinz',
            date: 'Thu Dec 4 13:31:02 2014 +0100',
            message: 'KD-1234 some commit'
          },
          {
            id: '12345f053abd58016df5d6e7d8ee491cc963cf5a',
            author: 'Karl-Heinz',
            date: 'Thu Dec 4 14:30:00 2014 +0100',
            message: 'KD-0 quick fix\nmanualchange: first manual change'
          },
          {
            id: 'eef34f053abd58016df5d6e7d8ee491cc963cf5a',
            author: 'Karl-Heinz',
            date: 'Thu Dec 4 15:30:00 2014 +0100',
            message: 'no KD-XXXX in the message\nmanualchange: second manual change\nmanualchange: and third one'
          },
          {
            id: '2ccaaaa53abd58016df5d6e7d8ee491cc963cf5a',
            author: 'Operator',
            date: 'Thu Dec 4 16:30:00 2014 +0100',
            message: 'KDO-123 \nmanualchange: works $%&\'"'
          }
        ],
        type: 'release'
      };
      return db['tags'].removeAsync({}, { multi: true })
        .then(() => git.storeTag(data.tag, data.commits, data.type))
        .then(() => db.tags.findAsync({ type: 'release' }))
        .then((docs) => {
          docs.should.have.lengthOf(1);
          let doc = docs[0];
          // we should have the extracted manual change messages
          doc.should.have.property('manual_changes');
          doc.manual_changes.should.have.lengthOf(4);
          doc.manual_changes.should.contain('first manual change');
          doc.manual_changes.should.contain('second manual change');
          doc.manual_changes.should.contain('and third one');
          doc.manual_changes.should.contain('works $%&\'"');
          // we should have proper formatted tickets without the manual change messages
          doc.should.have.property('tickets');
          doc.tickets.should.have.lengthOf(4);
          doc.tickets.should.contain('KD-1234');
          doc.tickets.should.contain('KD-0 quick fix');
          doc.tickets.should.contain('KD-0 no KD-XXXX in the message');
          doc.tickets.should.contain('KDO-123');
        });
    });
  })
});
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
        doc.tickets.should.contain('KD-0 Initial commit');
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
        doc.tickets.should.contain('KD-0 Initial commit');
        doc.commits.should.equal(3); // 2 commits + initial commit
				// should contain the differences to the first tag, that means one commit with ticket KD-5555
				doc = docs['16.01.2'];
				doc.tag.should.equal('16.01.2');
				doc.repository.should.equal('testgit');
				doc.tickets.should.contain('KD-2222');
        doc.commits.should.equal(1);
        doc.merges.should.equal(1);
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
				doc.commits.should.equal(2);
        doc.merges.should.equal(1);
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
				nextRelease.tickets.should.contain('KD-1111');
				nextRelease.tickets.should.contain('KD-2222');
				nextRelease.tickets.should.contain('KD-3333');
        nextRelease.tickets.should.have.lengthOf(3);
        nextRelease.merges.should.equal(1);
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
				tag.tickets.should.have.lengthOf(4);
				tag.tickets.should.contain('KD-1111');
				tag.tickets.should.contain('KD-2222');
				tag.tickets.should.contain('KD-3333');
        tag.tickets.should.contain('KD-0 Initial commit');
        tag.merges.should.equal(1);
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
				tag.tickets.should.have.lengthOf(4);
				tag.tickets.should.contain('KD-1111');
				tag.tickets.should.contain('KD-2222');
				tag.tickets.should.contain('KD-3333');
        tag.tickets.should.contain('KD-0 Initial commit');
        tag.merges.should.equal(1);
				var nextRelease = docs['Next Release'];
				nextRelease.tickets.should.have.lengthOf(1);
				nextRelease.tickets.should.contain('KD-4444');
        nextRelease.merges.should.equal(1);
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
  describe('', function() {
    var author = Git.Signature.create('Manuel Wick', 'manuel.wick@kairion.de', moment('2016-04-26 00:00:00').unix(), 120);

    it('New repository without any release tag should also deal with a new release branch', function() {
      return db['tags'].removeAsync({}, { multi: true })
        .then(() => Generator.init([ 'develop', 'release/15.04.4' ], author))
        .then(() => Generator.switchToBranch('release/15.04.4'))
        .then(() => Generator.createCommit([], author, 'KD-1234 commit in release branch'))
        .then(() => Generator.createCommit([], author, 'KD-4321 another one'))
        .then(() => git.initialize())
        .then(() => db.tags.findAsync({ type: 'release' }))
        .then((docs) => {
          docs.should.have.lengthOf(1);
          let doc = docs[0];
          doc.should.have.property('preliminary', true);
          doc.should.have.property('tickets');
          doc.tickets.should.contain('KD-1234');
          doc.tickets.should.contain('KD-4321');
          doc.tickets.should.contain('KD-0 Initial commit');
        })
    });
    it('Release branch should be handled as a preliminary release', function() {
      return Generator.init([ 'develop', 'release/15.04.3' ], author)
        .then(() => Generator.switchToBranch('master'))
        .then(() => Generator.createCommit([], author, 'KD-1111 commit 1'))
        .then((commitId) => Generator.repo.createTag(commitId, '15.04.1', 'Tag: 15.04.1'))
        .then(() => Generator.createCommit([], author, 'KD-2222 commit 2'))
        .then(() => Generator.createCommit([], author, 'KD-3333 commit 3'))
        .then((commitId) => Generator.repo.createTag(commitId, '15.04.2', 'Tag: 15.04.2'))
        .then(() => Generator.mergeBranches('release/15.04.3', 'master'))
        .then(() => Generator.switchToBranch('release/15.04.3'))
        .then(() => Generator.createCommit([], author, 'KD-4444 commit 4'))
        .then(() => db['tags'].removeAsync({}, { multi: true }))
        .then(() => git.initialize())
        .then(() => db.tags.findAsync({ type: 'release' }))
        .then((docs) => {
          docs.should.have.lengthOf(3);
          docs = helper.arrayToObject(docs, 'tag');
          // only the last release should be preliminary cause it is a new release branch and not a tag
          docs['15.04.1'].should.have.property('preliminary', false);
          docs['15.04.2'].should.have.property('preliminary', false);
          docs['15.04.3'].should.have.property('preliminary', true);
          // the release branch should show only the difference to tag 15.04.2 which means one commit
          docs['15.04.3'].tickets.should.contain('KD-4444');
        })
    })
    it('Release branch should be updated on new commits', function() {
      return Generator.createCommit([], author, 'KD-5555 commit 5')
        .then(() => git.initialize())
        .then(() => db.tags.findAsync({ type: 'release' }))
        .then((docs) => {
          docs.should.have.lengthOf(3);
          docs = helper.arrayToObject(docs, 'tag');
          docs['15.04.3'].should.have.property('preliminary', true);
          docs['15.04.3'].tickets.should.contain('KD-4444'); // the old commit should still be there
          docs['15.04.3'].tickets.should.contain('KD-5555'); // ... but also the new commit
        })
    });
    it('Adding a new status for the release branch should be possible', function() {
      return releases.addStatus('testing', '15.04.3', 'testgit', 'works', '22.04.2015 12:05', 'Manuel')
        .then(() => db.tags.findAsync({ type: 'release' }))
        .then((docs) => {
          docs = helper.arrayToObject(docs, 'tag');
          docs['15.04.3'].should.have.property('preliminary', true);
          docs['15.04.3'].release.testing.should.have.lengthOf(1);
          let status = docs['15.04.3'].release.testing[0];
          status.status.should.equal('works');
          status.author.should.equal('Manuel');
          status.date.should.equal('22.04.2015 12:05');
        })
    });
    it('status should not be touched by any new commit in the release branch', function() {
      return Generator.createCommit([], author, 'KD-6666 commit 6')
        .then(() => git.initialize())
        .then(() => db.tags.findAsync({ type: 'release' }))
        .then((docs) => {
          docs.should.have.lengthOf(3);
          docs = helper.arrayToObject(docs, 'tag');
          docs['15.04.3'].should.have.property('preliminary', true);
          docs['15.04.3'].tickets.should.contain('KD-6666'); // tag should have the new commit
          let status = docs['15.04.3'].release.testing[0];
          status.status.should.equal('works');
          status.author.should.equal('Manuel');
          status.date.should.equal('22.04.2015 12:05');
        })
    });
    it('and also not by finally creating the release tag that should replace the release branch', function() {
      return Generator.mergeBranches('master', 'release/15.04.3')
        .then((mergeCommit) => {
          return Generator.switchToBranch('master')
            .then(() => Generator.repo.createTag(mergeCommit, '15.04.3', 'new tag: 15.04.3'))
        })
        .then(() => git.initialize())
        .then(() => db.tags.findAsync({ type: 'release' }))
        .then((docs) => {
          docs.should.have.lengthOf(3);
          docs = helper.arrayToObject(docs, 'tag');
          // now we should have a real release tag, thus preliminary should be false
          docs['15.04.3'].should.have.property('preliminary', false);
          // we should have all previous tickets in the release branch
          docs['15.04.3'].tickets.should.contain('KD-4444');
          docs['15.04.3'].tickets.should.contain('KD-5555');
          docs['15.04.3'].tickets.should.contain('KD-6666');
          // status should be still the same
          let status = docs['15.04.3'].release.testing[0];
          status.status.should.equal('works');
          status.author.should.equal('Manuel');
          status.date.should.equal('22.04.2015 12:05');
        })
    });
    it('but by now new commits should not change the release any more', function() {
      return Generator.createCommit([], author, 'KD-7777 commit 7')
      .then(() => git.initialize())
        .then(() => db.tags.findAsync({ type: 'release' }))
        .then((docs) => {
          docs.should.have.lengthOf(3);
          docs = helper.arrayToObject(docs, 'tag');
          docs['15.04.3'].tickets.should.not.contain('KD-7777');
        })
    });
  });
});