"use strict";

var
  config = require('config'),
  log = require('./logger.js').releasemanager,
  Promise = require('bluebird'),
  JiraApi = require('jira').JiraApi;

class KJiraHelper {
  
  /**
   * build a Jira request object to add a new ticket
   * @param  {String} projectKey
   * @param  {String|Integer} issueTypeId
   * @param  {String} summary
   * @param  {String} assigneeName
   * @param  {String|Integer} epicKey
   * @param  {Array[String]} components
   * @return {Object} request object to add new ticket by calling Jira Rest API
   */
  createAuxiliaryIssueRequest(projectKey, issueTypeId, summary, assigneeName, epicKey, components) {
    // convert ids to strings is necessary
    issueTypeId = (typeof issueTypeId == 'number') ? String(issueTypeId) : issueTypeId;
    epicKey = (typeof epicKey == 'number') ? (projectKey + '-' + epicKey) : epicKey;

    var request = {
      fields: {
        project: {
          key: projectKey
        },
        issuetype: {
          id: issueTypeId
        },
        summary: summary,
        assignee: {
          name: assigneeName
        },
        components: components
      }
    };
    request.fields[config.get('jira.epicsKey')] = epicKey;
    return request;
  }

}

module.exports = KJiraHelper;
