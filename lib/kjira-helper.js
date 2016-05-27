"use strict";

var
	config = require('config'),
  log = require('./logger.js'),
  Promise = require('bluebird'),
  JiraApi = require('jira').JiraApi;

class KJiraHelper {
	
  /**
   * build a Jira request object to add a new ticket
   * @param  {String} projectKey   [description]
   * @param  {String|Integer} issueTypeId  [description]
   * @param  {String} summary      [description]
   * @param  {String} assigneeName [description]
   * @param  {String|Integer} epicKey      [description]
   * @param  {Array[String]} components   [description]
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
