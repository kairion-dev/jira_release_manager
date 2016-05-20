"use strict";

var
	Promise = require('bluebird'),
	log = require('./logger.js'),
	kcommon = require('./common.js'),
	config = require('config'),
	db = require('./db.js').db(config),
	Git = require('./git.js').GitHistory,
	JiraApi = require('./jira.js').Jira;


// The Core class uses the Singleton Pattern
let instance = null;

class Core {

	constructor() {
		if (!instance) {
			// load jira configs and lib
			let jiraConfig = JSON.parse(JSON.stringify(config.get('jira')));
			if (config.has('jira.oauth.consumer_secret')) {
			  jiraConfig.oauth.consumer_secret = fs.readFileSync(config.get('jira.oauth.consumer_secret'), "utf8");
			}
			this.jira = new JiraApi(jiraConfig, db);
			instance = this;
		}
		return instance;
	}

	init(repoId) {
		var options = {
	    path: config.get('git.repositories.' + repoId + '.path'),
	    name: config.get('git.repositories.' + repoId + '.name'),
	    feature_prefix: config.get('git.featurePrefix')
	  };
	  var git = new Git(options, db);
		return git.initialize()
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