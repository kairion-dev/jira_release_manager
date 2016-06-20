"use strict"

var
  Promise = require('bluebird'),
  config = require('config'),
  db = require('../lib/db.js').db(),
  Core = require('../lib/core.js'),
  log = require('../lib/logger.js').webhooks,
  Webhook = require('./abstract-webhook');

class TicketsToDeployAfterRelease extends Webhook {

  /**
   * @param  {String} id
   *   The webhook identifier
   * @param  {Object} params
   *   Not required for this webhook
   */
  constructor(id, params) {
    super(id, params);
    this.jira = new Core().jira;
    this.statusDeployed = config.get('jira.status.deployed');
    this.transitionDeployed = config.get('jira.transition.deployed');
  }

  /**
   * Only proceed when an epic ticket is moved to 'deployed'
   * 
   * @param  {Jira Callback} data
   * @return {Promise<Boolean>}
   */
  shouldBeExecuted(data) {
    return Promise.resolve(data && data.webhookEvent && data.webhookEvent == 'jira:issue_updated')
      .then((res) => {
        if (res) {
          if (!data || !data.issue || !data.issue.key) {
            return Promise.reject('Invalid request. It should at least contain issue.key');
          } else {
            return this.isEpicMovedToDeployed(data);
          }
        }
      });
  }

  /**
   * Get all children of the epic and set their status to 'Deployed'
   * 
   * @param  {Jira Callback} data
   *   Have a look at https://developer.atlassian.com/jiradev/jira-apis/webhooks
   * @return {Promise}
   */
  invoke(data) {
    var issue = data.issue;
    var issueKey = issue.key;

    return this.getAllEpicChildren(issueKey)
      .then((res) => {
        return Promise.map(res.issues, (issue) => {
          return this.doTransition(issue.key, {
            transition: {
              id: this.transitionDeployed
            }
          })
            .catch((e) => log.warn("Could not move ticket '" + issue.key + "' to 'Deployed'"));
        });
      });
  }

  /**
   * Check if an epic is moved to status 'deployed'
   * 
   * @param  {Object}  data
   * @return {Promise<Boolean>}
   *   true, if ticket is an epic and it has been moved to 'deployed'
   *   false, otherwise
   */
  isEpicMovedToDeployed(data) {
    return Promise.filter(data.changelog.items, (item) => {
      return item.field == 'status';
    })
      .then((res) => {
        return data.issue.fields.issuetype.id == config.get('jira.issueType.epic') &&
          res.length > 0 && res[0].to == this.statusDeployed;
      });
  }

  /**
   * Get all children of the epic with the given issueKey.
   * 
   * @param  {String} issueKey
   *   Must be of the type epic, otherwise nothing is returned.
   * @return {Promise<Array<Issue>>}
   *   An array of issues.
   */
  getAllEpicChildren(issueKey) {
    var options = { fields: ['status'] };
    return this.jira.jira.searchJiraAsync('parent in tempoEpicIssues('+issueKey+') OR "Epic Link" in ('+issueKey+') ORDER BY issuetype ASC, updatedDate ASC', options);
  }

  /**
   * Do a status transition for the given issue.
   * 
   * @param  {String} issueKey
   * @param  {Json} transition
   * @return {Promise}
   */
  doTransition(issueKey, transition) {
    return this.jira.jira.transitionIssueAsync(issueKey, transition);
  }

}

module.exports = TicketsToDeployAfterRelease;