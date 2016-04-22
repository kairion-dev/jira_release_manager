"use strict"
var
	Promise = require('bluebird'),
  kcommon = require('../lib/common.js'),
  db = require('../lib/db').db();


module.exports.getRepoReleases = function(repository) {
	return new Promise((resolve, reject) => {
		db.tags.find({ type: 'release', repository: repository }).sort({ tag: -1 }).exec((err, docs) => {
      if (err) reject(err);
      else resolve(docs);
    });
  })
}

module.exports.getAllReleases = function() {
	return new Promise(
    (resolve, reject) => {
      db.tags.find({ type: 'release' }).sort({ tag: -1 }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      });
    })
    .then((docs) => {
      return Promise.resolve(docs.reduce( // http://bluebirdjs.com/docs/api/promise.reduce.html
        (releases, doc, i, total) => {
          var tag = doc.tag;
          if (!(tag in releases)) {
            releases[tag] = { tag: tag, commits: 0, tickets: [], last_commit_date: -1 };
          }
          // aggregate release data
          releases[tag].commits = releases[tag].commits + doc.commits;
          releases[tag].tickets = kcommon.uniqueArray(releases[tag].tickets.concat(doc.tickets));
          // set date to the latest commit within all repositories
          if (new Date(doc.last_commit_date) > new Date(releases[tag].last_commit_date)) {
            releases[tag].last_commit_date = doc.last_commit_date;
          }
          return releases;
        }, {}))
    })
}

module.exports.getTagReleases = function(tag, jira) {
	return new Promise(
    (resolve, reject) => {
      db.tags.find({ type: 'release', tag: tag }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      })
    })
    .then((docs) => {
      return Promise.map(docs, (doc, i, total) => {
        return jira.getIssues(doc.tickets)
          .then(jira.linkChildren)
          .then((tickets) => {
            tickets = tickets.reduce(
              (current, ticket) => {
                if (ticket.issueType == 'Bug') {
                  current.bugfixes.push(ticket);
                } else {
                  current.features.push(ticket);
                }
                return current;
              }, { features: [], bugfixes: [] });
            tickets.features.sort((a,b) => { return a.key < b.key });
            tickets.bugfixes.sort((a,b) => { return a.key < b.key });
            return { repo: doc.repository, tickets: tickets, release: doc.release };
          })
      });
    })
}

module.exports.addStatus = function(type, tag, repo, status, date, author) {
	return new Promise((resolve, reject) => {
    var id = new Date().getTime();
    var element = { ['release.' + type]: { id: id, status: status, date: date, author: author }};
    db.tags.update({ type: 'release', tag: tag, repository: repo }, { $push: element }, {}, (err, numUpdated) => {
      if (err) reject(err);
      else resolve(id)
    })
  })
}

module.exports.removeStatus = function(type, tag, repo, id) {
	return new Promise((resolve, reject) => {
    var element = { ['release.' + type]: { id: parseInt(id) }};
    db.tags.update({ type: 'release', tag: tag, repository: repo }, { $pull: element }, {}, (err, numUpdated) => {
      if (err) reject(err);
      else resolve(element);
    })
  })
}

module.exports.getRelease = function(repo, tag) {
	return new Promise(
    (resolve, reject) => {
      db.tags.findOne({ type: 'release', tag: tag, repository: repo }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      });
    })
};

module.exports.getTickets = function(release, jira) {
	return jira.getIssues(release.tickets)
		.then(jira.linkChildren);
}