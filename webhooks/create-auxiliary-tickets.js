"use strict";

var
  Promise = require('bluebird'),
  config = require('config'),
  db = require('../lib/db.js').db(),
  Core = require('../lib/core.js'),
  KJiraHelper = require('../lib/kjira-helper.js'),
  Webhook = require('./abstract-webhook');

class CreateAuxiliaryTickets extends Webhook {

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
  }

  description() {
    return 'Once an epic is created in Jira, add the following auxiliary tickets: Deployment, Code Review, Functional Review and Roadmap Planning.';
  }


  /**
   * Load mapping between issueTypeIds -> issueTypeNames for later use
   * @return {Promise}
   */
  init() {
    return this.initIssueTypeNames()
      .then((issueTypeNames) => {
        return this.issueTypeNames = issueTypeNames;
      })
  }


  /**
   * Only process epic tickets that just have been created
   * @param  {Object} data
   * @return {Boolean}
   */
  shouldBeExecuted(data) {
    return Promise.resolve(data && data.webhookEvent && data.webhookEvent == 'jira:issue_created')
      .then((res) => {
        if (res) {
          if (!data || !data.issue || !data.issue.key) {
            return Promise.reject('Request malformed. It should at least contain issue.key');
          }
          // get the complete issue (the Jira webhook only contains the key when creating a new issue)
          return this.findIssue(data.issue.key)
            .then((issue) => {
              if (issue && issue.fields && issue.fields.issuetype && issue.fields.issuetype.id && issue.fields.issuetype.id == config.get('jira.issueType.epic')) {
                this.issue = issue;
                return true;
              }
            })
        }
      })
  }

  /**
   * Process incoming data to create auxiliary tickets: Deployment, Code Review, Functional Review and Roadmap Planning
   * @param  {Jira Callback} data
   *   Have a look at https://developer.atlassian.com/jiradev/jira-apis/webhooks
   * @return {Promise}
   */
  invoke(data) {
    var issue = this.issue;
    var issueKey = issue.key;

    var auxiliaryIssueTypeIds = [
      config.get('jira.issueType.deployment'),
      config.get('jira.issueType.codeReview'),
      config.get('jira.issueType.functionalReview'),
      config.get('jira.issueType.roadmapPlanning')
    ];

    // create new tickets by calling the Jira Rest API with a well formed request
    return Promise.map(auxiliaryIssueTypeIds, (issueTypeId) => {
        var summary = issue.fields.summary.replace('Workpackage:', this.issueTypeNames[issueTypeId] + ':');
        var request = this.kjiraHelper.createAuxiliaryIssueRequest(
          issue.fields.project.key,
          issueTypeId,
          summary.trim(),
          issue.fields.assignee.name,
          issueKey,
          issue.fields.components
        );
        return this.addIssue(request);
      });
  }

  /**
   * Get the issue with the given key.
   * @param  {String} issuekey
   *   E.g. 'KD-9786'
   * @return {Promise<Issue>}
   */
  findIssue(issuekey) {
    return this.jira.jira.findIssueAsync(issuekey);
  }

  /**
   * Add a new Jira ticket with the given data in issueRequest
   * @param {Promise<Object>} issueRequest
   *   For more detail have a look at: https://developer.atlassian.com/jiradev/jira-apis/jira-rest-apis/jira-rest-api-tutorials/jira-rest-api-example-create-issue
   */
  addIssue(issueRequest) {
    return this.jira.jira.addNewIssueAsync(issueRequest);
  }


  /**
   * Get the names of the different issue types stored in Jira and link them to their ids.
   * @return {Promise<Object>}
   *   E.g. { '2' => 'Deployment', '10500' => 'Concept / Roadmap', ...}
   */
  initIssueTypeNames() {
    return this.jira.jira.listIssueTypesAsync()
      .then((issueTypes) => {
        return Promise.reduce(issueTypes, (total, issueType) => {
          total[issueType.id] = issueType.name;
          return total;
        }, {});
      })
  }

}

module.exports = CreateAuxiliaryTickets;