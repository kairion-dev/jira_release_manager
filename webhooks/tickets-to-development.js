"use strict";

var
  Promise = require('bluebird'),
  config = require('config'),
  db = require('../lib/db.js').db(),
  Core = require('../lib/core.js'),
  log = require('../lib/logger.js'),
  Webhook = require('./abstract-webhook');

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
            return this.doTransition(issue.key, { transition: { id: this.transitionId } } )
              .catch((e) => {
                return this.tryToInitTimeEstimate(issue.key)
                  .catch((e) => log.warn("Could not move ticket '" + issue.key + "' to 'Selected for Development': " + e));
              });
          }
        });
      });
  }


  /**
   * Check if a ticket of type epic is moved from planned to selected for development
   * @param  {Jira Callback} data
   * @return {Promise{Boolean}}
   *   true, if the ticket is an epic and correctly moved
   *   false, otherwise
   */
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
   * Try to init the estimated and remaining time by checking the subticket's estimated time.
   * If there are estimated subtickets, time of the parent ticket will be set to 0 and the ticket will be moved.
   * 
   * @param  {String} issueKey
   * @return {Promse}
   */
  tryToInitTimeEstimate(issueKey) {
    return this.findIssue(issueKey)
      .then((res) => {
        // if we have no time estimated but subtickets
        if (res && res.fields.timeestimate == null && res.fields.subtasks.length > 0) {
          // get keys of all subtickets
          var issueKeys = res.fields.subtasks.map((subtask) => subtask.key);
          return this.getTimeEstimates(issueKeys)
            .then((res) => {
              // sum up estimated time of all subtickets
              return Promise.reduce(res.issues, (total, issue) => {
                return total + issue.fields.timeestimate;
              }, 0);
            });
        }
      })
      .then((timeEstimated) => {
        if (timeEstimated) {
          return this.initTimetracking(issueKey)
            .then(() => this.doTransition(issueKey, { transition: { id: this.transitionId } } ))
            .catch((e) => Promise.reject('Estimated and remaining time set but still failing to set status'))
        } else {
          return Promise.reject('No subticket or none of them has estimated time');
        }
      });
  }


  /**
   * Find a Jira issue.
   * 
   * @param  {String} issueKey
   *   e.g. 'KD-10790'
   * @return {Promise{JiraIssue}}
   */
  findIssue(issueKey) {
    return this.jira.jira.findIssueAsync(issueKey);
  }


  /**
   * Get time estimates for the given issues.
   * 
   * @param  {Array{String}} issueKeys
   *   e.g. ['KD-10790', 'KD-8997']
   * @return {Promise{Array{JiraIssue}}}
   */
  getTimeEstimates(issueKeys) {
    return this.jira.jira.searchJiraAsync('key in (' + issueKeys.toString() + ')', { fields: ['timeestimate'] });
  }


  /**
   * Set the estimated and remaining time of the ticket with issueKey to 0h.
   * 
   * @param  {String} issueKey
   * @return {Promise}
   */
  initTimetracking(issueKey) {
    return this.jira.jira.updateIssueAsync(issueKey, { update: { timetracking: [{ set: { originalEstimate: '0h', remainingEstimate: '0h' } }] } });
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

module.exports = TicketsToDevelopment;