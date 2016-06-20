"use strict";

var
  Promise = require('bluebird'),
  log = require('../lib/logger.js').webhooks,
  Webhook = require('./abstract-webhook');

class LoggerIssueUpdated extends Webhook {

  /**
   * Process when a ticket has been updated.
   * 
   * @param  {Object} data
   * @return {Promise<Boolean>}
   */
  shouldBeExecuted(data) {
    return Promise.resolve(data && data.webhookEvent && data.webhookEvent == 'jira:issue_updated');
  }

  /**
   * Just return the incoming data in order to log it.
   * 
   * @param  {Jira Callback} data
   *   Have a look at https://developer.atlassian.com/jiradev/jira-apis/webhooks
   * @return {Promise}
   */
  invoke(data) {
    return Promise.resolve(data);
  }

}

module.exports = LoggerIssueUpdated;