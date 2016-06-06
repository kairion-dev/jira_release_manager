"use strict";

var
  Promise = require('bluebird'),
  config = require('config'),
  db = require('../lib/db.js').db(),
  Core = require('../lib/core.js'),
  KJiraHelper = require('../lib/kjira-helper.js'),
  Webhook = require('./abstract-webhook');

var core = new Core();

class TicketsToDevelopment extends Webhook {

  /**
   * @param  {String} id
   *   The webhook identifier
   * @param  {Object} params
   *   Not required for this webhook
   */
  constructor(id, params) {
    super(id, params);
    this.jira = new Core().jira;
    this.kjiraHelper = new KJiraHelper();
    this.transitionId = config.get('jira.transition.selectedForDevelopment');
    this.statusNotPlanned = config.get('jira.status.notPlanned');
    this.statusSelectedForDevelopment = config.get('jira.status.selectedForDevelopment');
  }


  /**
   * Only proceed when an epic ticket is moved from 'Not Planned' to 'Selected For Development'
   * 
   * @param  {Object} data
   * @return {Boolean}
   */
  shouldBeExecuted(data) {
    return Promise.resolve(data && data.webhookEvent && data.webhookEvent == 'jira:issue_updated')
      .then((res) => {
        if (res) {
          if (!data || !data.issue || !data.issue.key) {
            return Promise.reject('Invalid request. It should at least contain issue.key');
          } else {
            return this.epicMovedFromNotPlannedToDevelopment(data);
          }
        }
      });
  }

  /**
   * Get all children of the epic and set them to 'Selected for Development' if still not planned
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
          // only move those children to 'Selected for Development' that are not planned
          if (issue.fields.status.id == this.statusNotPlanned ) {
            return this.doTransition(issue.key, {
              transition: {
                id: this.transitionId
              }
            });
          }
        });
      });
  }


  epicMovedFromNotPlannedToDevelopment(data) {
    return Promise.filter(data.changelog.items, (item) => {
      return item.field == 'status';
    })
      .then((res) => {
        return data.issue.fields.issuetype.id == config.get('jira.issueType.epic') &&
          res.length > 0 && res[0].to == this.statusSelectedForDevelopment;
      });
  }


  /**
   * Get all children of the epic with the given issueKey.
   * 
   * @param  {String} issueKey
   *   Must be of the type epic, otherwise nothing is returned.
   * @return {Promise{Array{Issue}}}
   *   An array of issues.
   */
  getAllEpicChildren(issueKey) {
    var options = { fields: ['status'] };
    return core.jira.jira.searchJiraAsync('parent in tempoEpicIssues('+issueKey+') OR "Epic Link" in ('+issueKey+') ORDER BY issuetype ASC, updatedDate ASC', options);
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

module.exports = TicketsToDevelopment;