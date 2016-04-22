var
  express = require('express'),
  Promise = require('bluebird'),
  router = express.Router(),
  log = require('../lib/logger.js'),
  model = require('../models/open-branches.js');


router.get('/', function(req, res, next) {
  var templateVars = {
    title: 'Open Branches',
    menuSelected: 'menu-open-branches'
  };

  model.getAllOpenBranches()
    .then((branches) => {
      templateVars.branches = branches;
      res.render('openBranches/index', templateVars);
    })
    .catch((e) => {
      log.error(e);
      res.render('error', {
        message: 'Error while fetching documents: ' + e.message,
        error: e
      });
    });
});

router.get('/repo/:repo/:tag', function(req, res, next) {
  model.getOpenBranch(req.params.tag, req.params.repo)
    .then((doc) => {
      var templateVariables = {
        title: 'Branch ' + req.params.tag,
        tickets: [],
        menuSelected: 'menu-open-branches',
        breadcrumbs: [
          { link: '/openBranches', title: 'Open Branches' },
          { link: '/openBranches/' + req.params.tag, title: 'Open Branch ' + req.params.tag }
        ]
      };
      if (doc) {
        templateVariables.release = doc;
        req.jira
          .getIssues(doc.tickets)
          .then(req.jira.linkChildren)
          .then((tickets) => {
            templateVariables.tickets = tickets;
            res.render('releases/show', templateVariables);
          });
      }
      else {
        res.render('releases/notFound', templateVariables);
      }
    })
    .catch((e) => {
      log.error(e);
      res.render('error', {
        message: 'Error while fetching documents: ' + e.message,
        error: e
      });
    });
});

router.get('/:branch', function(req, res, next) {
  model.getOpenBranches(req.params.branch)
    .then((docs) => {
      return model.enrichOpenBranchesWithTickets(docs, req.jira);
    })
    .then((branches) => {
      var templateVars = {
        title: 'Open branch ' + req.params.branch,
        docs: branches,
        tag: req.params.branch,
        menuSelected: 'menu-open-branches',
        breadcrumbs: [
          { link: '/openBranches', title: 'Open Branches' }
        ]
      };
      res.render('openBranches/show', templateVars);
    })
    .catch((e) => {
      log.error(e);
      res.render('error', {
        message: 'Error while fetching documents: ' + e.message,
        error: e
      });
    })
});

module.exports = router;
