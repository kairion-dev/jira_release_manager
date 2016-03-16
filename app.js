var express = require('express');
var cookieParser = require('cookie-parser')
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var bodyParser = require('body-parser');
var config = require('node-yaml-config').load('./config/config.yaml');

var routes = require('./routes/index');
var releases = require('./routes/releases');
var open = require('./routes/openBranches');


function init(db, jira) {
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

  app.use(function(req, res, next) {
    req.db = db;
    req.jira = jira;
    req.repositories = Object.keys(config.git);
    req.selectedRepository = req.cookies.selectedRepository || req.repositories[0];
    next();
  });

  app.use('/', routes);
  app.use('/releases', releases);
  app.use('/open', open);

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
