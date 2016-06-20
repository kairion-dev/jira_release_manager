"use strict";

var
  Promise = require('bluebird'),
  log = require('./logger.js').releasemanager,
  kcommon = require('./common.js'),
  config = require('config'),
  db = require('./db.js').db(),
  Git = require('./git.js').GitHistory,
  fs = require('fs'),
  JiraApi = require('./jira.js').Jira;


// The Core class uses the Singleton Pattern
let instance = null;


/**
 * Provide the core functionality of the release-manager.
 *
 * Available class properties:
 *   this.jira
 *     to access the Jira implementation to handle tickets in the release manager
 *   this.git
 *     to access all initialized Git repositories
 */
class Core {

  constructor() {
    if (!instance) {

      // init Jira library
      let jiraConfig = JSON.parse(JSON.stringify(config.get('jira')));
      if (config.has('jira.oauth.consumer_secret')) {
        jiraConfig.oauth.consumer_secret = fs.readFileSync(config.get('jira.oauth.consumer_secret'), "utf8");
      }
      this.jira = new JiraApi(jiraConfig, db);

      // git property for initializing repositories later on
      this.git = {};

      // provide singleton of the class
      instance = this;
    }
    return instance;
  }

  initRepository(repoId) {
    // add Git repository if it does not already exist
    if (!this.git[repoId]) {
      var options = {
        path: config.get('git.repositories.' + repoId + '.path'),
        name: config.get('git.repositories.' + repoId + '.name'),
        feature_prefix: config.get('git.featurePrefix')
      };
      this.git[repoId] = new Git(options, db);
    }

    return this.git[repoId].initialize()
      .then((tags) => {
        log.info('Processed all tags.');
        // Updating ALL known tickets
        var tickets_to_process = [];

        return db.tags.findAsync({})
          .map((doc) => {
            return Promise.map(doc.tickets,
              (ticket) => {
                if (!ticket.startsWith('KD-0')) {
                  tickets_to_process.push(ticket);
                }
              })
          })
          .then(() => kcommon.uniqueArray(tickets_to_process))
          .then((tickets) => {
            var fetchedIssues = {};
            return db.tickets.findAsync({})
              .map((ticket) => {
                fetchedIssues[ticket.key] = ticket;
              })
              .then(() => {
                log.info('Already fetched ' + Object.keys(fetchedIssues).length + ' issues from ' + tickets.length);
                return this.jira.fetchIssues(tickets, {fetchParents: true, fetchedIssues: fetchedIssues});
              });
          })
      })
  }
}


module.exports = Core;