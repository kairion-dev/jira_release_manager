var
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
  },
  jira = new JiraApi({
    host: 'kairion.atlassian.net',
    epicsKey: 'customfield_10500',
    newCapKey: 'customfield_13103',
    oauth: {
      consumer_key: '94S37YKpXdmmbENb',
      consumer_secret: fs.readFileSync(process.env['HOME'] + '/.ssh/jira_rsa', "utf8"),
      access_token: 'VnBpdujgzdSHtJnTOXSY6xfqml2Y6NZg',
      access_token_secret: 'nhclzMeidDRZiAOeVyIa0BI5CtAe3Kk2'
    },
    db: db
  }),
  git = new Git({
    git_path: '/home/attrib/kairion/kairion.git',
    git_name: 'kairion',
    db: db
  }),
  app = require('./app.js')(db, jira);

git
  .initialize()
  .then((tags) => {
    console.log('Processed all tags.');
//    console.log(tags);
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
            console.log('Already fetched ' + Object.keys(fetchedIssues).length + ' issues from ' + tickets.length);
            return jira.fetchIssues(tickets, {fetchParents: true, fetchedIssues: fetchedIssues})
          });
      })
  })
  .then(() => {
    console.log('Inital fetch done, starting app');

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
    console.log('Error processing all tags: ' + e);
  });
