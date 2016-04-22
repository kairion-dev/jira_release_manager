"use strict"
var
	Promise = require('bluebird'),
  db = require('../lib/db').db();

module.exports.getAllOpenBranches = function() {
	return new Promise(
    (resolve, reject) => {
      db.tags.find({ type: 'branch' }).sort({ tag: -1 }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      });
    })
    .then((docs) => {
      return Promise.resolve(docs.reduce(
        (branches, doc, i, total) => {
          var branch = doc.tag;
          if (!(branch in branches)) {
            branches[branch] = { tag: branch, commits: 0, tickets: [], last_commit_date: -1 };
          }
          // aggregate release data
          branches[branch].commits = branches[branch].commits + doc.commits;
          branches[branch].tickets = branches[branch].tickets.concat(doc.tickets);
          // set date to the latest commit within all repositories
          if (new Date(doc.last_commit_date) > new Date(branches[branch].last_commit_date)) {
            branches[branch].last_commit_date = doc.last_commit_date;
          }
          return branches;
        }, {})
      );
    })
};

module.exports.getOpenBranch = function (tag, repo) {
	return new Promise(
    (resolve, reject) => {
      db.tags.findOne({ type: 'branch', tag: tag, repository: repo }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      });
    })
};

module.exports.enrichOpenBranchesWithTickets = function(docs, jira) {
	return Promise.map(docs, (doc, i, total) => {
    return jira
      .getIssues(doc.tickets)
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
};

module.exports.getOpenBranches = function(tag) {
	return new Promise(
    (resolve, reject) => {
      db.tags.find({ type: 'branch', tag: tag }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      })
    })
};