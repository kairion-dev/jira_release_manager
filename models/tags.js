"use strict"
var
	Promise = require('bluebird'),
  kcommon = require('../lib/common.js'),
  db = require('../lib/db').db();


module.exports = function(tagType) {
  var module = {};

  module.getRepoTags = function(repository) {
    return new Promise((resolve, reject) => {
      db.tags.find({ type: tagType, repository: repository }).sort({ tag: -1 }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      });
    })
  }

  module.getAggregatedTags = function() {
    return new Promise(
      (resolve, reject) => {
        db.tags.find({ type: tagType }).sort({ tag: -1 }).exec((err, docs) => {
          if (err) reject(err);
          else resolve(docs);
        });
      })
      .then((docs) => {
        return Promise.resolve(docs.reduce( // http://bluebirdjs.com/docs/api/promise.reduce.html
          (branches, doc, i, total) => {
            var tag = doc.tag;
            if (!(tag in branches)) {
              branches[tag] = { tag: tag, commits: 0, tickets: [], last_commit_date: -1 };
            }
            // aggregate release data
            branches[tag].commits = branches[tag].commits + doc.commits;
            branches[tag].tickets = kcommon.uniqueArray(branches[tag].tickets.concat(doc.tickets));
            // set date to the latest commit within all repositories
            if (new Date(doc.last_commit_date) > new Date(branches[tag].last_commit_date)) {
              branches[tag].last_commit_date = doc.last_commit_date;
            }
            return branches;
          }, {}))
      })
  }

  module.getTagDocsWithTickets = function(tag, jira) {
    return getTagDocs(tag)
      .then((docs) => enrichTagsWithTickets(docs, jira));
  };

  var getTagDocs = function(tag) {
    return new Promise(
      (resolve, reject) => {
        db.tags.find({ type: tagType, tag: tag }).exec((err, docs) => {
          if (err) reject(err);
          else resolve(docs);
        })
      })
  };

  var enrichTagsWithTickets = function(docs, jira) {
    return Promise.map(docs, (doc, i, total) => {
      return jira.getIssues(doc.tickets)
        .then(jira.linkChildren)
        .then((tickets) => {
          let quickfixes = false;
          tickets = tickets.reduce(
            (current, ticket) => {
              if (ticket.key.startsWith('KD-0 ')) {
                quickfixes = true;
              } else {
                let issueType = (ticket.issueType == 'Bug') ? 'bugfixes' : 'features';
                current[issueType].push(ticket);
              }
              return current;
            }, { features: [], bugfixes: [] });
          tickets.features.sort((a,b) => { return a.key < b.key });
          tickets.bugfixes.sort((a,b) => { return a.key < b.key });
          tickets.quickfixes = quickfixes;
          return { repo: doc.repository, tickets: tickets, release: doc.release };
        })
    });
  };

  module.addStatus = function(statusType, tag, repo, status, date, author) {
    return new Promise((resolve, reject) => {
      var id = new Date().getTime();
      var element = { ['release.' + statusType]: { id: id, status: status, date: date, author: author }};
      db.tags.update({ type: tagType, tag: tag, repository: repo }, { $push: element }, {}, (err, numUpdated) => {
        if (err) reject(err);
        else resolve(id)
      })
    })
  }

  module.removeStatus = function(statusType, tag, repo, id) {
    return new Promise((resolve, reject) => {
      var element = { ['release.' + statusType]: { id: parseInt(id) }};
      db.tags.update({ type: tagType, tag: tag, repository: repo }, { $pull: element }, {}, (err, numUpdated) => {
        if (err) reject(err);
        else resolve(element);
      })
    })
  }

  module.getTagDoc = function(repo, tag) {
    return new Promise(
      (resolve, reject) => {
        db.tags.findOne({ type: tagType, tag: tag, repository: repo }).exec((err, docs) => {
          if (err) reject(err);
          else resolve(docs);
        });
      })
  };
  
  /**
   * Group KD-0 tickets as children to one ticket.
   * 
   * @param  {Array{Ticket}} tickets
   * @return {Array{Ticket}}
   *   The exact same tickets as before except all undefined tickets are grouped to a new ticket
   */
  var groupUndefinedTickets = function(tickets) {
    var resultTickets = [], children = [];
    tickets.forEach((ticket) => {
      if (ticket.key.startsWith('KD-0 ')) {
        children.push(ticket);
      } else {
        resultTickets.push(ticket);
      }
    });
    if (children.length > 0) {
      var groupTicket = {
        key: 'Group',
        project: 'KD',
        summary: 'Quickfixes and/or undefined tickets',
        status: '-',
        issueType: '-',
        assignee: '-',
        components: [],
        parent: false,
        newCap: false,
        children: []
      };
      children.forEach((ticket) => {
        groupTicket.children.push(ticket);
      })
      resultTickets.push(groupTicket)
    }
    return resultTickets;
  }

  module.getTickets = function(release, jira) {
    return jira.getIssues(release.tickets)
      .then((tickets) => jira.linkChildren(tickets))
      .then((tickets) => groupUndefinedTickets(tickets));
  }

  return module;
}