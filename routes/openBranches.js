var
  express = require('express'),
  Promise = require('bluebird'),
  router = express.Router();


router.get('/', function(req, res, next) {
  var templateVars = {
    title: 'Open Branches',
    menuSelected: 'menu-open-branches'
  };

  new Promise(
    (resolve, reject) => {
      req.db.tags.find({ type: 'branch' }).sort({ tag: -1 }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      });
    })
    .then((docs) => {
      return Promise.resolve(docs.reduce(
        (branches, doc, i, total) => {
          var branch = doc.tag;
          if (!(branch in branches)) {
            branches[branch] = { tag: branch, commits: 0, tickets: [], last_commit_date: -1 };
          }
          // aggregate release data
          branches[branch].commits = branches[branch].commits + doc.commits;
          branches[branch].tickets = branches[branch].tickets.concat(doc.tickets);
          // set date to the latest commit within all repositories
          if (new Date(doc.last_commit_date) > new Date(branches[branch].last_commit_date)) {
            branches[branch].last_commit_date = doc.last_commit_date;
          }
          return branches;
        }, {})
      );
    })
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

router.get('/repo/:repo/:id', function(req, res, next) {
  new Promise(
    (resolve, reject) => {
      req.db.tags.findOne({ type: 'branch', tag: req.params.id, repository: req.params.repo }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      });
    })
    .then((doc) => {
      var templateVariables = {
        title: 'Branch ' + req.params.id,
        tickets: [],
        menuSelected: 'menu-open-branches',
        breadcrumbs: [
          { link: '/openBranches', title: 'Open Branches' },
          { link: '/openBranches/' + req.params.id, title: 'Open Branch ' + req.params.id }
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
  new Promise(
    (resolve, reject) => {
      req.db.tags.find({ type: 'branch', tag: req.params.branch }).exec((err, docs) => {
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
      var templateVars = {
        title: 'Open branch ' + req.params.branch,
        docs: releases,
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
