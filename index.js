var
  log = require('./lib/logger.js'),
  Promise = require('bluebird'),
  config = require('config'),
  http = require('http'),
  kcommon = require('./lib/common.js'),
  Core = require('./lib/core'),
  fs = require('fs')


// load the release-manager
var core = new Core();
var app = require('./app.js')(core.jira);


// "Unable to connect to JIRA during findIssueStatus" if run in parallel, thus we fetch the repository issues in serial
Promise.mapSeries(Object.keys(config.get('git.repositories')), (repoId) => {
  return core.initRepository(repoId); 
})
  .then(() => {
    log.info('Inital fetch done, starting app');

    var port = kcommon.normalizePort(config.get('http.port') || '3000');
    var host = config.get('http.host') || 'localhost';
    app.set('port', port);

    /**
     * Create HTTP server.
     */
    var server = http.createServer(app);

    /**
     * Listen on provided port, on all network interfaces.
     */
    server.listen(port, host);
    server.on('error', kcommon.onError);
    server.on('listening', function onListening() {
      var addr = server.address();
      var bind = typeof addr === 'string'
        ? 'pipe ' + addr
        : 'port ' + addr.port;
      log.info('Listening on ' + bind);
    });
  })
  .catch((e) => {
    log.error('Error processing all tags: ' + e);
  });

