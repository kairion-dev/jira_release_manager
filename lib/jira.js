"use strict";

var
  log = require('./logger.js'),
  Promise = require("bluebird"),
  kcommon = require('./common.js'),
  JiraApi = require('jira').JiraApi;

class Jira {

  constructor(options, db) {
    this.options = {
      protocol: options.protocol || 'https',
      host: options.host,
      port: options.port || null,
      username: options.username || null,
      password: options.password || null,
      strictSSL: options.strictSSL || true,
      oauth: options.oauth || null,
      epicsKey: options.epicsKey || false,
      newCapKey: options.newCapKey || false
    };
    this.db = db || false;
    this.jira = Promise.promisifyAll(new JiraApi(this.options.protocol, this.options.host, this.options.port, this.options.username, this.options.password, '2', false, this.options.strictSSL, this.options.oauth));
  }

  /**
   * Fetch issues from Atlassian Server.
   *
   * @param issueKeys []
   *   Array of issue keys XX-1234
   *
   * @param userOptions {*}
   *   fetchParents: boolean Should epics and parents also be retrieved
   *   fetchedIssues: [] Already fetched issues, we don't want to update
   *
   *  @return {*|Promise.<T>} Promise with Array of found issues
   */
  fetchIssues(issueKeys, userOptions) {
    userOptions = userOptions || {};
    var options = {
      fetchParents: userOptions.fetchParents || false,
      fetchedIssues: userOptions.fetchedIssues || {},
      parents: userOptions.parents || [],
      zeroCounter: 1
    };
    return Promise
      .map(issueKeys, (issueKey) => {
        if (options.fetchedIssues[issueKey]) {
          if (options.fetchedIssues[issueKey].parent) {
            options.parents.push(options.fetchedIssues[issueKey].parent);
          }
          return options.fetchedIssues[issueKey];
        }
        if (issueKey.startsWith('KD-0')) {
          options.fetchedIssues[issueKey] = {
            key: 'KD-0 (' + options.zeroCounter + ')',
            project: 'KD',
            summary: issueKey.replace('KD-0', '').trim(),
            status: 'Done',
            issueType: 'QuickFix',
            assignee: '',
            components: [],
            parent: false,
            newCap: false
          };
          options.zeroCounter++;
          return options.fetchedIssues[issueKey];
        }
        log.info('Fetching Issue ' + issueKey);
        return this.jira
          .findIssueAsync(issueKey)
          // Prepare records and update DB
          .then((issue) => {
            var dbDoc = {
              key: issueKey,
              project: issue.fields.project.key,
              summary: issue.fields.summary,
              status: issue.fields.status.name,
              issueType: issue.fields.issuetype.name,
              assignee: issue.fields.assignee.displayName,
              components: [],
              parent: false,
              newCap: false
            };
            if (issue.fields.components) {
              issue.fields.components.forEach((component) => {
                dbDoc.components.push(component.name)
              });
            }
            if (issue.fields.parent) {
              dbDoc.parent = issue.fields.parent.key;
              options.parents.push(dbDoc.parent);
            }
            if (this.options.epicsKey && issue.fields[this.options.epicsKey]) {
              dbDoc.parent = issue.fields[this.options.epicsKey];
              options.parents.push(issue.fields[this.options.epicsKey]);
            }
            if (this.options.newCapKey && issue.fields[this.options.newCapKey]) {
              dbDoc.newCap = issue.fields[this.options.newCapKey];
            }
            options.fetchedIssues[dbDoc.key] = dbDoc;
            if (this.db) {
              return new Promise((resolve, reject) => {
                this.db.tickets.update({key: issueKey}, {$set: dbDoc}, {upsert: true}, (err, numUpdated) => {
                  if (err) reject(err);
                  else resolve(dbDoc);
                });
              });
            }
            else {
              return dbDoc;
            }
          })
          .catch((e) => {
            log.error('Error processing ticket ' + issueKey + ': ' + e);
          });
      })
      // Fetch parents if needed
      .then(() => {
        if (options.fetchParents) {
          if (options.parents.length > 0) {
            var parents = kcommon.uniqueArray(options.parents);
            options.parents = [];
            return this.getIssues(parents, options)
              .then(() => {
                return options.fetchedIssues;
              });
          }
        }
        return options.fetchedIssues;
      }) // We return an array of fetched issues
      .then((tickets) => {
        return Object.keys(tickets).map((key) => {
          return tickets[key];
        });
      });
  }

  /**
   * Get all issues with these keys
   *
   * @param issueKeys []
   *   Array of issue keys XX-1234
   * @param userOptions {*}
   *   fetchParents: boolean - Get parents?
   *   forceUpdate: boolean - Force update means we don't use pre fetched states
   */
  getIssues(issueKeys, userOptions) {
    userOptions = userOptions || {};
    var options = {
      fetchParents: userOptions.fetchParents || true,
      fetchedIssues: userOptions.fetchedIssues || {}
    };
    return new Promise((resolve, reject) => {
      if (!userOptions.forceUpdate) {
        return this.db.tickets.findAsync({ key: { $in: issueKeys } })
          .map((ticket) => {
            options.fetchedIssues[ticket.key] = ticket;
          })
          .then(() => {
            resolve(options)
          });
      }
      else {
        return resolve(options);
      }
    })
      .then((options) => {
        return this.fetchIssues(issueKeys, options);
      });
  }

  linkChildren(tickets) {
    var tmp = {}, children = {}, resultTickets = [];
    tickets.forEach((ticket) => {
      tmp[ticket.key] = ticket;
      if (ticket.parent) {
        if (!children[ticket.parent]) {
          children[ticket.parent] = [];
        }
        children[ticket.parent].push(ticket.key);
      }
    });
    Object.keys(children).forEach((ticket) => {
      if (tmp[ticket]) { // we have to check because ticket could be a child and thus already been deleted
        tmp[ticket].children = [];
        children[ticket].forEach((child_id) => {
          tmp[ticket].children.push(tmp[child_id]);
          delete tmp[child_id];
        });
      }
    });
    Object.keys(tmp).forEach((ticket) => {
      resultTickets.push(tmp[ticket]);
    });
    return Promise.resolve(resultTickets);
  }

}

module.exports.Jira = Jira;