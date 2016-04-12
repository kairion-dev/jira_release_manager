var
  express = require('express'),
  Promise = require("bluebird"),
  router = express.Router(),
  log = require('../lib/logger.js');

router.get('/repo/:repo', function(req, res, next) {

  var templateVars = {
    title: 'Releases',
    targetPath: req.params.repo + '/',
    menuSelected: 'menu-releases-repo'
  };

  new Promise(
    (resolve, reject) => {
      req.db.tags.find({ type: 'release', repository: req.params.repo }).sort({ tag: -1 }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      });
    })
    .then((docs) => {
      templateVars.releases = docs;
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
  var templateVars = {
    title: 'Release Plans',
    targetPath: 'plan/',
    menuSelected: 'menu-releases-plan'
  };

  new Promise(
    (resolve, reject) => {
      req.db.tags.find({ type: 'release' }).sort({ tag: -1 }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      });
    })
    .then((docs) => {
      return Promise.resolve(docs.reduce( // http://bluebirdjs.com/docs/api/promise.reduce.html
        (releases, doc, i, total) => {
          var tag = doc.tag;
          if (!(tag in releases)) {
            releases[tag] = { tag: tag, commits: 0, tickets: [], last_commit_date: -1 };
          }
          // aggregate release data
          releases[tag].commits = releases[tag].commits + doc.commits;
          releases[tag].tickets = releases[tag].tickets.concat(doc.tickets);
          // set date to the latest commit within all repositories
          if (new Date(doc.last_commit_date) > new Date(releases[tag].last_commit_date)) {
            releases[tag].last_commit_date = doc.last_commit_date;
          }
          return releases;
        }, {})
      );
    })
    .then((releases) => {
      templateVars.releases = releases;
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
  new Promise((resolve, reject) => {
    var id = new Date().getTime();
    var element = { ['release.' + req.body.type]: { id: id, status: req.body.status, date: req.body.date, author: req.body.author }};
    req.db.tags.update({ type: 'release', tag: req.body.tag, repository: req.body.repo }, { $push: element }, {}, (err, numUpdated) => {
      if (err) reject(err);
      else resolve(element)
    })
  })
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
  new Promise((resolve, reject) => {
    var element = { ['release.' + req.params.type]: { id: parseInt(req.params.id) }};
    req.db.tags.update({ type: 'release', tag: req.params.tag, repository: req.params.repo }, { $pull: element }, {}, (err, numUpdated) => {
      if (err) reject(err);
      else resolve(element);
    })
  })
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
  new Promise(
    (resolve, reject) => {
      req.db.tags.find({ type: 'release', tag: req.params.tag }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      })
    })
    .then((docs) => {
      return Promise.map(docs, (doc, i, total) => {
        return req.jira
          .getIssues(doc.tickets)
          .then(req.jira.linkChildren)
          .then((tickets) => {
            tickets = tickets.reduce(
              (current, ticket) => {
                if (ticket.issueType == 'Bug') {
                  current.bugfixes.push(ticket);
                } else {
                  current.features.push(ticket);
                }
                return current;
              }, { features: [], bugfixes: [] });
            tickets.features.sort((a,b) => { return a.key < b.key });
            tickets.bugfixes.sort((a,b) => { return a.key < b.key });
            return { repo: doc.repository, tickets: tickets, release: doc.release };
          })
      });
    })
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


router.get('/repo/:repo/:id', function(req, res, next) {
  new Promise(
    (resolve, reject) => {
      req.db.tags.findOne({ type: 'release', tag: req.params.id, repository: req.params.repo }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      });
    })
    .then((doc) => {
      var templateVariables = {
        title: 'Release ' + req.params.id,
        tickets: [],
        menuSelected: 'menu-releases-plan',
        breadcrumbs: [
          { link: '/releases/plan', title: 'Release Plans' },
          { link: '/releases/plan/' + req.params.id, title: 'Release Plan ' + req.params.id }
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

module.exports = router;
