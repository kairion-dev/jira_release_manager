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
      newCapKey: options.newCapKey || false,
      db: options.db || false
    };
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
   *  @return Promise with Array of found issues
   */
  fetchIssues(issueKeys, userOptions) {
    userOptions = userOptions || {};
    var options = {
      fetchParents: userOptions.fetchParents || false,
      fetchedIssues: userOptions.fetchedIssues || {},
      parents: userOptions.parents || [],
      epics: userOptions.epics || []
    };
    return Promise
      .map(issueKeys, (issueKey) => {
        if (options.fetchedIssues[issueKey]) {
          return options.fetchedIssues[issueKey];
        }
        console.log('Fetching Issue ' + issueKey);
        return this.jira
          .findIssueAsync(issueKey)
          // Prepare records and update DB
          .then((issue) => {
            var dbDoc = {
              key: issueKey,
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
            if (this.options.db) {
              return new Promise((resolve, reject) => {
                this.options.db.update({key: issueKey}, {$set: dbDoc}, {upsert: true}, (err, numUpdated) => {
                  if (err) reject(err);
                  else resolve(dbDoc);
                });
              });
            }
            else {
              return dbDoc;
            }
          })
          // Fetch parents if needed
          .then(() => {
            if (options.fetchParents) {
              // First parents, these can have more epics
              if (options.parents.length > 0) {
                var parents = kcommon.uniqueArray(options.parents);
                options.parents = [];
                return this
                  .fetchIssues(parents, options)
                  .then(() => {
                    if (options.epics.length > 0) {
                      var epics = kcommon.uniqueArray(options.epics);
                      options.epics = [];
                      return this.fetchIssues(epics, options);
                    }
                    return options.fetchedIssues;
                  });
              }
              else if (options.epics.length > 0) {
                var epics = kcommon.uniqueArray(options.epics);
                options.epics = [];
                return this.fetchIssues(epics, options);
              }
            }
            else {
              return options.fetchedIssues;
            }
          })
          .catch((e) => {
            console.log('Error processing ticket ' + issueKey + ': ' + e);
          });
      })
      // We return an array of fetched issues
      .then(() => {
        return Object.keys(options.fetchedIssues).map((key) => {
          return options.fetchedIssues[key];
        });
      });
  }
}

module.exports.Jira = Jira;
