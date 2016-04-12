var
  log = require('./lib/logger.js'),
  Promise = require("bluebird"),
  Datastore = Promise.promisifyAll(require('nedb')),
  debug = require('debug')('release_page:server'),
  http = require('http'),
  kcommon = require('./lib/common.js'),
  JiraApi = require('./lib/jira.js').Jira,
  Git = require("./lib/git.js").GitHistory,
  fs = require('fs'),
  db = {
    tags: Promise.promisifyAll(new Datastore({ filename: './tags', autoload: true })),
    tickets: Promise.promisifyAll(new Datastore({ filename: './tickets', autoload: true }))
  };

// load configs
var config = require('node-yaml-config').load('./config/config.yaml');
if (config.jira && config.jira.oauth && config.jira.oauth.consumer_secret) {
  config.jira.oauth.consumer_secret = fs.readFileSync(process.env['HOME'] + config.jira.oauth.consumer_secret, "utf8");
}

// load release-manager
var
  jira = new JiraApi(config.jira, db),
  app = require('./app.js')(db, jira, config);

// "Unable to connect to JIRA during findIssueStatus" if run in parallel, thus we fetch the repository issues in serial
Promise.mapSeries(Object.keys(config.git.repositories), (configId) => {
  var options = {
    path: config.git.repositories[configId].path,
    name: config.git.repositories[configId].name,
    feature_prefix: config.git.featurePrefix
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
        .then(() => {
          return kcommon.uniqueArray(tickets_to_process);
        })
        .then((tickets) => {
          var fetchedIssues = {};
          return db.tickets.findAsync({})
            .map((ticket) => {
              fetchedIssues[ticket.key] = ticket;
            })
            .then(() => {
              log.info('Already fetched ' + Object.keys(fetchedIssues).length + ' issues from ' + tickets.length);
              return jira.fetchIssues(tickets, {fetchParents: true, fetchedIssues: fetchedIssues})
            });
        })
    })
})
  .then(() => {
    log.info('Inital fetch done, starting app');

    var port = kcommon.normalizePort(process.env.PORT || '3000');
    app.set('port', port);

    /**
     * Create HTTP server.
     */

    var server = http.createServer(app);

    /**
     * Listen on provided port, on all network interfaces.
     */

    server.listen(port);
    server.on('error', kcommon.onError);
    server.on('listening', function onListening() {
      var addr = server.address();
      var bind = typeof addr === 'string'
        ? 'pipe ' + addr
        : 'port ' + addr.port;
      debug('Listening on ' + bind);
    });
  })
  .catch((e) => {
    log.error('Error processing all tags: ' + e);
  });

