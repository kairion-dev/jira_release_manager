var express = require('express');
var cookieParser = require('cookie-parser');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var bodyParser = require('body-parser');

var routes = require('./routes/index');
var releases = require('./routes/releases');
var openBranches = require('./routes/openBranches');
var webhooks = require('./routes/webhooks');


function init(jira) {
  var app = express();

// view engine setup
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

  app.use(logger('dev'));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/bower_components', express.static(path.join(__dirname, 'bower_components')));

  app.use(function(req, res, next) {
    // req.db = db;
    req.jira = jira;
    res.locals.menuItems = [
      // { id: 'menu-releases-repo', name: 'Releases', href: '/releases/repo/' + res.locals.repositories.selected }, // we don't want 'releases' right now
      { id: 'menu-releases-plan', name: 'Release Plans', href: '/releases/plan' },
      { id: 'menu-open-branches', name: 'Open Branches', href: '/openBranches' },
      // { id: 'menu-webhooks', name: 'Webhooks', href: '/webhooks/show' } // uncomment to show webhooks link in menu
    ];
    next();
  });

  app.use('/', routes);
  app.use('/releases', releases);
  app.use('/openBranches', openBranches);
  app.use('/webhooks', webhooks);

// catch 404 and forward to error handler
  app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
  });

// error handlers

// development error handler
// will print stacktrace
  if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
      res.status(err.status || 500);
      res.render('error', {
        message: err.message,
        error: err
      });
    });
  }

// production error handler
// no stacktraces leaked to user
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: {}
    });
  });

  return app;
}


module.exports = init;
