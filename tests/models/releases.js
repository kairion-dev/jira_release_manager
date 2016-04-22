var
	chai = require('chai'),
	should = chai.should(),
	Promise = require('bluebird'),
	config = require('../../lib/config.js').config('testing'),
	db = require('../../lib/db.js').db(config), // init database with testing environment configs...
	releases = require('../../models/releases.js'); // ... so that models will work upon the corresponding databases (internally)

chai.use(require('chai-things')); // to test array elements with chai



function drop(database) {
	return db[database].removeAsync({}, { multi: true })
};

function insert(database, docs, dropBeforeInsert) {
	return (dropBeforeInsert === true ?
			drop(database) : 
			Promise.resolve()
		)
		.then(() => {
			return db[database].insertAsync(docs);
		})
};

function checkSingleDoc(doc, source) {
	doc.should.contain.keys(Object.keys(source));
	doc.commits.should.equal(source.commits);
	doc.last_commit_date.should.equal(source.last_commit_date);
	// TODO extend: check all properties automatically
};

/**
 * Returns the object values (since we don't have Object.values() yet - will come in ECMAScript 2017)
 * @param  {[type]} object [description]
 * @return {[type]}        [description]
 */
function objectValues(object) {
	return Object.keys(object).map((key) => object[key]);
}



function arrayToObject(array, key) {
	return array.reduce((obj, current) => {
		obj[current[key]] = current;
		return obj;
	}, {});
}

/**
 * Generate a KD-0 ticket. Uses the same logic as jira.js does.
 * @return {[type]} [description]
 */
function generateKDZeroTicket(issueKey, zeroCounter) {
	return {
    key: 'KD-0 (' + zeroCounter + ')',
    project: 'KD',
    summary: issueKey.replace('KD-0', '').trim(),
    status: 'Done',
    issueType: 'QuickFix',
    assignee: '',
    components: [],
    parent: false,
    newCap: false
  };
}

function removeIds(docs) {
	docs.map((doc) => {
		delete doc._id; // remove each doc id to have the exact same data as in the source
		if (doc.children) {
			removeIds(doc.children); // also remove for each child if we have
		}
	});
}

before(function() {

});

beforeEach(function() {

});

describe('Unit testing', function() {
	var releases1 = [
		{"type":"release","tag":"16.01.1","repository":"repo1","tickets":["KD-0 bootup changes","KD-0 brain connect mode","KD-1111","KD-2222","KD-3333"],"commits":50,"last_commit_date":"Fri Jan 29 16:01:09 2016 +0100","release":{"testing":[],"deploy":[]}},
		{"type":"release","tag":"16.01.1","repository":"repo2","tickets":["KD-0 bugfix","KD-1111","KD-2222","KDO-111"],"commits":35,"last_commit_date":"Fri Jan 29 16:01:23 2016 +0100","release":{"testing":[],"deploy":[]}},
		{"type":"release","tag":"16.01.1","repository":"repo3","tickets":["KD-2222"],"commits":10,"last_commit_date":"Wed Dec 2 13:14:29 2015 +0100","release":{"testing":[],"deploy":[]}},
		{"type":"release","tag":"15.12.2","repository":"repo1","tickets":["KD-4444","KD-5555"],"commits":7,"last_commit_date":"Fri Dec 4 12:55:33 2015 +0100","release":{"testing":[],"deploy":[]}},
		{"type":"release","tag":"15.12.2","repository":"repo2","tickets":["KD-4444"],"commits":6,"last_commit_date":"Thu Dec 3 07:14:29 2015 +0100","release":{"testing":[],"deploy":[]}},
		{"type":"release","tag":"15.12.1","repository":"repo2","tickets":["KD-6666","KDO-222"],"commits":8,"last_commit_date":"Tue Dec 1 15:00:00 2015 +0100","release":{"testing":[],"deploy":[]}}
	];
	var tickets1 = [
		{"key":"KD-1111","project":"KD","summary":"ai doc-update","status":"Deployed","issueType":"Sub-task","assignee":"Tomasz Porst","components":[],"parent":"KD-7777","newCap":false},
		{"key":"KD-2222","project":"KD","summary":"Merge cleanup","status":"Deployed","issueType":"Code review","assignee":"Tomasz Porst","components":[],"parent":false,"newCap":false},
		{"key":"KD-3333","project":"KD","summary":"Create epos client for Redcoon (ad tag)","status":"Not done / cancelled","issueType":"Development","assignee":"Karl Fritsche","components":[],"parent":false,"newCap":false},
		{"key":"KD-4444","project":"KD","summary":"mediaplanning vs. real data","status":"Deployed","issueType":"Bug","assignee":"Matthias Lersch","components":[],"parent":false,"newCap":false},
		{"key":"KD-5555","project":"KD","summary":"support: AdOps, Shops, Team","status":"Deployed","issueType":"Development","assignee":"Matthias Lersch","components":[],"parent":false,"newCap":false},
		{"key":"KD-6666","project":"KD","summary":"High memory usage of EC","status":"Deployed","issueType":"Bug","assignee":"Matthias Lersch","components":[],"parent":false,"newCap":false},
		{"key":"KD-7777","project":"KD","summary":"The parent ticket","status":"Deployed","issueType":"Development","assignee":"Tomasz Porst","components":[],"parent":false,"newCap":false},
		{"key":"KDO-111","project":"KDO","summary":"Drupal security updates","status":"Not done / cancelled","issueType":"Server maintenance","assignee":"Karl Fritsche","components":[],"parent":false,"newCap":false},
		{"key":"KDO-222","project":"KDO","summary":"Epos für In-storemedia anlegen","status":"Deployed","issueType":"Enhance / debug shop","assignee":"Vikrant Agrawal","components":[],"parent":false,"newCap":false}
	];
	describe('Some basics', function() {
		it('Nothing in database, nothing should be returned', function() {
			return drop('tags') // make sure db is empty
				.then(() => {
					return releases.getAllReleases();
				}) //TODO also test other releases.methods()
				.then((docs) => {
					docs.should.be.empty;
				});
		});
	});
	describe('Release model', function() {
		before(function() {
			console.log('Populate the tags database with releases');
			return insert('tags', releases1, true);
		});
		it('Release model should return the same values as direct db access', function() {
			return Promise.each(releases1, (item, i, total) => {
				// access each release directly through database
				return db.tags.findAsync({type: item.type, tag: item.tag, repository: item.repository})
					.then((docs) => {
						docs.should.have.lengthOf(1);
						checkSingleDoc(docs[0], item);
						// get release through model
						return releases.getRelease(item.repository, item.tag);
					})
					.then((release) => {
						checkSingleDoc(release, item);
					})
			})
		});
		it('getRepoReleases() should only return repository specific releases', function() {
			return releases.getRepoReleases('repo1')
				.then((docs) => {
					removeIds(docs); // remove each doc id to have the exact same data as in the source

					docs.should.have.lengthOf(2);
					docs.should.include.something.that.deep.equals(releases1[0]);
					docs.should.not.include.something.that.deep.equals(releases1[1]);
					docs.should.not.include.something.that.deep.equals(releases1[2]);
					docs.should.include.something.that.deep.equals(releases1[3]);
					docs.should.not.include.something.that.deep.equals(releases1[4]);
					docs.should.not.include.something.that.deep.equals(releases1[5]);

					return releases.getRepoReleases('repo2');
				})
				.then((docs) => {
					removeIds(docs); // remove each doc id to have the exact same data as in the source

					docs.should.have.lengthOf(3);
					docs.should.not.include.something.that.deep.equals(releases1[0]);
					docs.should.include.something.that.deep.equals(releases1[1]);
					docs.should.not.include.something.that.deep.equals(releases1[2]);
					docs.should.not.include.something.that.deep.equals(releases1[3]);
					docs.should.include.something.that.deep.equals(releases1[4]);
					docs.should.include.something.that.deep.equals(releases1[5]);

					return releases.getRepoReleases('repo3');
				})
				.then((docs) => {
					removeIds(docs); // remove each doc id to have the exact same data as in the source

					docs.should.have.lengthOf(1);
					docs.should.not.include.something.that.deep.equals(releases1[0]);
					docs.should.not.include.something.that.deep.equals(releases1[1]);
					docs.should.include.something.that.deep.equals(releases1[2]);
					docs.should.not.include.something.that.deep.equals(releases1[3]);
					docs.should.not.include.something.that.deep.equals(releases1[4]);
					docs.should.not.include.something.that.deep.equals(releases1[4]);
				})
		});
		describe('getAllReleases()', function() {
			it('commits should equal the aggregated commits for each tag', function() {
				return releases.getAllReleases()
					.then((docs) => {
						docs['16.01.1'].commits.should.equal(95);
						docs['15.12.2'].commits.should.equal(13);
						docs['15.12.1'].commits.should.equal(8);
					});
			});
			it('last_commit_date should equal the latest commit within the tag', function() {
				return releases.getAllReleases()
					.then((docs) => {
						docs['16.01.1'].last_commit_date.should.equal("Fri Jan 29 16:01:23 2016 +0100");
						docs['15.12.2'].last_commit_date.should.equal("Fri Dec 4 12:55:33 2015 +0100");
						docs['15.12.1'].last_commit_date.should.equal("Tue Dec 1 15:00:00 2015 +0100");
					});
			});
			it('check accumulated tickets for each tag', function() {
				var shouldContainElements = function(array, elements) {
					elements.forEach((element) => {
						array.should.contain(element);
					});
				};
				return releases.getAllReleases()
					.then((docs) => {
						docs['16.01.1'].tickets.should.have.lengthOf(7); // 3 (KD-xxxx) + 3 (KD-0) + 1 (KDO-xxx)
						shouldContainElements(docs['16.01.1'].tickets, ["KD-0 bootup changes","KD-0 brain connect mode","KD-1111","KD-2222","KD-3333","KD-0 bugfix","KDO-111"]);
						docs['15.12.2'].tickets.should.have.lengthOf(2); // 2 (KD-xxxx)
						shouldContainElements(docs['15.12.2'].tickets, ["KD-4444","KD-5555"]);
						docs['15.12.1'].tickets.should.have.lengthOf(2); // 1 (KD-xxxx) + 1 (KDO-xxx)
						shouldContainElements(docs['15.12.1'].tickets, ["KD-6666","KDO-222"]);
					});
			});
		});
		describe('Test logic that works with tickets', function() {
			// startup jira library
			var JiraApi = require('../../lib/jira.js').Jira;
			var jira = new JiraApi(config.jira, db);
			
			// to access tickets more easy (via key)
			var ticketsObj = arrayToObject(tickets1, 'key');

			// prepare parent ticket
			var kd7777 = ticketsObj['KD-7777'];
			kd7777.children = [ ticketsObj['KD-1111'] ]; // add KD-1111 as child to KD-7777

			before(function() {
				console.log('Populate the tickets database');
				return insert('tickets', tickets1, true);
			});
			it('getTickets()', function() {
				return releases.getTickets(releases1[0], jira)
					.then((tickets) => {
						removeIds(tickets);
						// should include the 'normal' tickets
						tickets.should.include.something.that.deep.equals(ticketsObj['KD-2222']);
						tickets.should.include.something.that.deep.equals(ticketsObj['KD-3333']);
						// should include the KD-0 tickets with correct summary
						tickets.should.include.something.that.deep.equals(generateKDZeroTicket("KD-0 bootup changes", 1));
						tickets.should.include.something.that.deep.equals(generateKDZeroTicket("KD-0 brain connect mode", 2));
						// should include the parent ticket of KD-1111 (that is KD-7777)
						tickets.should.include.something.that.deep.equals(kd7777);
						// so we expect no KD-1111 within the tickets
						tickets.should.not.include.something.that.deep.equals(ticketsObj['KD-1111']);

						return releases.getTickets(releases1[1], jira);
					})
					.then((tickets) => {
						removeIds(tickets);
						// should include the 'normal' tickets
						tickets.should.include.something.that.deep.equals(ticketsObj['KD-2222']);
						tickets.should.include.something.that.deep.equals(ticketsObj['KDO-111']);
						// should include the KD-0 tickets with correct summary
						tickets.should.include.something.that.deep.equals(generateKDZeroTicket("KD-0 bugfix", 1));
						// should include the parent ticket of KD-1111 (that is KD-7777)
						tickets.should.include.something.that.deep.equals(kd7777);
						// so we expect no KD-1111 within the tickets
						tickets.should.not.include.something.that.deep.equals(ticketsObj['KD-1111']);
					})
			});
			describe('getTagReleases()', function() {
				it('correct structure', function() {
					return releases.getTagReleases('15.12.2', jira)
						.then((docs) => {
							docs = arrayToObject(docs, 'repo'); // to access the single repository more easy

							// we expect 2 repositories in the release
							docs.should.contain.keys(['repo1', 'repo2']);

							// we expect a certain structure
							docs['repo1'].should.contain.keys(['repo', 'tickets', 'release']);
							docs['repo1'].tickets.should.contain.keys(['features', 'bugfixes']);
							docs['repo2'].should.contain.keys(['repo', 'tickets', 'release']);
							docs['repo2'].tickets.should.contain.keys(['features', 'bugfixes']);
						})
				});
				it('features and bugfixes are separated correctly', function() {
					return releases.getTagReleases('16.01.1', jira)
						.then((docs) => {
							docs = arrayToObject(docs, 'repo'); // to access the single repository more easy

							// we expect 3 repositories in the release
							docs.should.contain.keys(['repo1', 'repo2', 'repo3']);

							// no bug ticket expected for 16.01.1
							docs['repo1'].tickets.bugfixes.should.have.lengthOf(0);

							// all tickets are features
							var features = docs['repo1'].tickets.features;
							removeIds(features); // to compare with test data source

							features.should.include.something.that.deep.equals(ticketsObj['KD-2222']);
							features.should.include.something.that.deep.equals(ticketsObj['KD-3333']);
							features.should.include.something.that.deep.equals(generateKDZeroTicket("KD-0 bootup changes", 1));
							features.should.include.something.that.deep.equals(generateKDZeroTicket("KD-0 brain connect mode", 2));
							features.should.include.something.that.deep.equals(kd7777);
							features.should.not.include.something.that.deep.equals(ticketsObj['KD-1111']);

							// TODO also check repo2 and repo3 in detail

							return releases.getTagReleases('15.12.2', jira);
						})
						.then((docs) => {
							docs = arrayToObject(docs, 'repo'); // to access the single repository more easy

							// we expect 2 repositories in the release
							docs.should.contain.keys(['repo1', 'repo2']);

							// 1 bug ticket expected for 15.12.2
							docs['repo1'].tickets.bugfixes.should.have.lengthOf(1);
							var bugfixes = docs['repo1'].tickets.bugfixes;
							removeIds(bugfixes);
							bugfixes.should.include.something.that.deep.equals(ticketsObj['KD-4444']);
							// 1 feature ticket expected for 15.12.2
							docs['repo1'].tickets.features.should.have.lengthOf(1);
							var features = docs['repo1'].tickets.features;
							removeIds(features);
							features.should.include.something.that.deep.equals(ticketsObj['KD-5555']);

							// no feature ticket for repo2 ...
							docs['repo2'].tickets.features.should.have.lengthOf(0);
							// ... but 1 bug ticket
							docs['repo2'].tickets.bugfixes.should.have.lengthOf(1);
							var bugfixes2 = docs['repo2'].tickets.bugfixes;
							removeIds(bugfixes2);
							bugfixes2.should.include.something.that.deep.equals(ticketsObj['KD-4444']);
						});
				});
			});
		});
	});
	
	// it('First real test', function() {
	// 	return releases.getRelease('repo1', '16.01.2')
	// 		.then((doc) => {
	// 			doc.should.contain.all.keys(['type', 'tag', 'repository']);
	// 			doc.type.should.equal('release');
	// 			doc.tag.should.equal('16.01.2');
	// 			doc.repository.should.equal('repo1');
	// 		})
	// })
});