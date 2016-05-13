"use strict";

var Promise = require('bluebird'),
	// we initialize the database connection here but use the configurable params.dbName to select the right database
	db = require('../lib/db.js').db(),
	Webhook = require('./abstract-webhook');

class UpdateTicket extends Webhook {

	/**
	 * @param  {String} id
	 *   The webhook identifier
	 * @param  {Object} params
	 *   params.dbName is required which identifies the tickets database defined in require('lib/db.js').db();
	 */
	constructor(id, params) {
		if (!params || !params.dbName) {
			throw new Error('Database name must be specified in params.dbName');
		}
		super(id, params);
	}

	/**
	 * Only process jira requests which have updated an issue
	 * @param  {Object} data
	 * @return {Boolean}
	 */
	shouldBeExecuted(data) {
		return data && data.webhookEvent && data.webhookEvent == 'jira:issue_updated';
	};

	/**
	 * Process incoming data to update a ticket.
	 * @param  {Jira Callback} data
	 *   Have a look at https://developer.atlassian.com/jiradev/jira-apis/webhooks
	 * @return {Promise}
	 */
	invoke(data) {
		if (!data || !data.issue || !data.issue.key) {
			return Promise.reject('Not updated. Please make sure that at least data.issue.key exists.');
		}

		var issue = data.issue;
		var issueKey = issue.key;
		var dbDoc = { key: issueKey };

		if (issue.fields.project && issue.fields.project.key) {
			dbDoc.project = issue.fields.project.key;
		}
		if (issue.fields.summary) {
			dbDoc.summary = issue.fields.summary;
		}
		if (issue.fields.status && issue.fields.status.name) {
			dbDoc.status = issue.fields.status.name;
		}
		if (issue.fields.issuetype && issue.fields.issuetype.name) {
			dbDoc.issueType = issue.fields.issuetype.name;
		}
		if (issue.fields.assignee && issue.fields.assignee.displayName) {
			dbDoc.assignee = issue.fields.assignee.displayName;
		}
		if (issue.fields.components) {
			dbDoc.components = issue.fields.components;
		}
		if (issue.fields.parent) {
			dbDoc.parent = issue.fields.parent;
		}
		if (issue.fields.newCap) {
			dbDoc.newCap = issue.fields.newCap;
		}

		return db[this.params.dbName].updateAsync({key: issueKey}, {$set: dbDoc});
	}

}

module.exports = UpdateTicket;