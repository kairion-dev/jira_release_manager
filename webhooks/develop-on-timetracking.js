"use strict";

var
  Promise = require('bluebird'),
  config = require('config'),
  db = require('../lib/db.js').db(),
  Core = require('../lib/core.js'),
  KJiraHelper = require('../lib/kjira-helper.js'),
  Webhook = require('./abstract-webhook');

class StatusToDevelopOnTimetracking extends Webhook {

  /**
   * @param  {String} id
   *   The webhook identifier
   * @param  {Object} params
   *   Not required for this webhook
   */
  constructor(id, params) {
    super(id, params);
    this.jira = new Core().jira;
  }

  /**
   * Proceed when time is tracked and ticket is not planned yet
   * 
   * @param  {Object} data
   * @return {Promise<Boolean>}
   */
  shouldBeExecuted(data) {
    return Promise.resolve(data && data.webhookEvent && data.webhookEvent == 'jira:issue_updated')
      .then((res) => {
        if (res) {
          if (!data || !data.issue || !data.issue.key) {
            return Promise.reject('Invalid request. It should at least contain issue.key');
          } else {
            return Promise.resolve(data.issue.fields.timespent && data.issue.fields.status.id == config.get('jira.status.notPlanned')); 
          }
        }
      })
  }

  /**
   * Set status of ticket to 'Selected for development' as soon as time is tracked on the ticket
   * 
   * @param  {Jira Callback} data
   *   Have a look at https://developer.atlassian.com/jiradev/jira-apis/webhooks
   * @return {Promise}
   */
  invoke(data) {
    var issue = data.issue;
    var issueKey = issue.key;

    // Set ticket to 'Selected for development' by calling the corresponding transition.
    var transitionId = config.get('jira.transition.selectedForDevelopment');
    return this.doTransition(issueKey, {
      transition: {
        id: transitionId
      }
    });
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

module.exports = StatusToDevelopOnTimetracking;