"use strict";

var
  Promise = require("bluebird"),
  kcommon = require('./common.js'),
  JiraApi = require('jira').JiraApi;

class Jira {

  constructor(options) {
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
    this.db = options.db || false;
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
      epics: userOptions.epics || [],
      zeroCounter: 1
    };
    return Promise
      .map(issueKeys, (issueKey) => {
        if (options.fetchedIssues[issueKey]) {
          if (options.fetchedIssues[issueKey].epic) {
            options.epics.push(options.fetchedIssues[issueKey].epic);
          }
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
            epic: false,
            newCap: false
          };
          options.zeroCounter++;
          return options.fetchedIssues[issueKey];
        }
        console.log('Fetching Issue ' + issueKey);
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
              epic: false,
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
              dbDoc.epic = issue.fields[this.options.epicsKey];
              options.epics.push(dbDoc.epic);
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
            console.log('Error processing ticket ' + issueKey + ': ' + e);
          });
      })
      // Fetch parents if needed
      .then(() => {
        if (options.fetchParents) {
          // First parents, these can have more epics
          if (options.parents.length > 0) {
            var parents = kcommon.uniqueArray(options.parents);
            options.parents = [];
            return this
              .getIssues(parents, options)
              .then(() => {
                if (options.epics.length > 0) {
                  var epics = kcommon.uniqueArray(options.epics);
                  options.epics = [];
                  return this.getIssues(epics, options);
                }
                return options.fetchedIssues;
              });
          }
          else if (options.epics.length > 0) {
            var epics = kcommon.uniqueArray(options.epics);
            options.epics = [];
            return this.getIssues(epics, options);
          }
        }
        else {
          return options.fetchedIssues;
        }
      })      // We return an array of fetched issues
      .then((tickets) => {
        return Object.keys(options.fetchedIssues).map((key) => {
          return options.fetchedIssues[key];
        });
      });
  }

  /**
   * Get all issues with these keys
   *
   * @param issueKeys []
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
}

module.exports.Jira = Jira;
