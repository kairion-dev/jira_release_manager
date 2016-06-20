var
  express = require('express'),
  Promise = require('bluebird'),
  router = express.Router(),
  log = require('../lib/logger.js'),
  model = require('../models/tags.js')('release');

router.get('/repo/:repo', function(req, res, next) {
  model.getRepoTags(req.params.repo)
    .then((releases) => {
      var templateVars = {
        title: 'Releases',
        targetPath: req.params.repo + '/',
        menuSelected: 'menu-releases-repo',
        releases: releases
      };
      res.render('releases/index', templateVars);
    })
    .catch((e) => {
      log.error(e);
      res.render('error', {
        message: 'Error while fetching documents: ' + e.message,
        error: e
      });
    });
});


router.get('/plan', function(req, res, next) {
  model.getAggregatedTags()
    .then((releases) => {
      var templateVars = {
        title: 'Release Plans',
        targetPath: 'plan/',
        menuSelected: 'menu-releases-plan',
        releases: releases
      };
      res.render('releases/index', templateVars);
    })
    .catch((e) => {
      log.error(e);
      res.render('error', {
        message: 'Error while fetching documents: ' + e.message,
        error: e
      });
    });
});


router.post('/plan/add/status', function(req, res, next) {
  model.addStatus(req.body.type, req.body.tag, req.body.repo, req.body.status, req.body.date, req.body.author)
    .then((element) => {
      res.redirect('/releases/plan/' + req.body.tag);
    })
    .catch((e) => {
      res.render('error', {
        message: 'Error while updating release status',
        error: e
      });
    })
});


router.get('/plan/:tag/:repo/:type/remove/:id', function(req, res, next) {
  model.removeStatus(req.params.type, req.params.tag, req.params.repo, req.params.id)
    .then((element) => {
      res.redirect('/releases/plan/' + req.params.tag);
    })
    .catch((e) => {
      res.render('error', {
        message: 'Error while updating release status',
        error: e
      });
    })
});


router.get('/plan/:tag', function(req, res, next) {
  model.getTagDocsWithTickets(req.params.tag, req.jira)
    .then((releases) => {
      var statusClasses = {
        'Default': 'label label-default',
        'Works': 'label label-success',
        'Inactive': 'label label-warning',
        'Fails': 'label label-danger'
      };
      var templateVars = {
        title: 'Release Plan ' + req.params.tag,
        docs: releases,
        tag: req.params.tag,
        statusClasses: statusClasses,
        menuSelected: 'menu-releases-plan',
        breadcrumbs: [
          { link: '/releases/plan', title: 'Release Plans' }
        ]
      };
      res.render('releases/plan', templateVars);
    })
    .catch((e) => {
      log.error(e);
      res.render('error', {
        message: 'Error while fetching documents: ' + e.message,
        error: e
      });
    })
});


router.get('/repo/:repo/:tag', function(req, res, next) {
  model.getTagDoc(req.params.repo, req.params.tag)
    .then((release) => {
      var templateVariables = {
        title: 'Release Plan ' + req.params.tag + ' - '  + req.params.repo,
        tickets: [],
        menuSelected: 'menu-releases-plan',
        breadcrumbs: [
          { link: '/releases/plan', title: 'Release Plans' },
          { link: '/releases/plan/' + req.params.tag, title: 'Release Plan ' + req.params.tag }
        ]
      };
      if (release) {
        model.getTickets(release, req.jira)
          .then((tickets) => {
            templateVariables.release = release;
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

module.exports = router;
