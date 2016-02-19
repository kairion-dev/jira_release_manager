var express = require('express');
var router = express.Router();
var log = require('../lib/logger.js');

/* GET index page. */
router.get('/', function(req, res) {
  var templateVariables = { title: 'Releases' };

  new Promise(
    (resolve, reject) => {
      req.db.tags.find({}).sort({ tag: -1 }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      });
    })
    .then((docs) => {
      templateVariables.releases = docs;
      res.render('releases/index', templateVariables);
    })
    .catch((e) => {
      log.error(e);
      res.render('error', {
        message: 'Error while fetching documents: ' + e.message,
        error: e
      });
    });
});

router.get('/:id', function(req, res, next) {
  new Promise(
    (resolve, reject) => {
      req.db.tags.findOne({ tag: req.params.id }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      });
    })
    .then((doc) => {
      if (doc) {
        var templateVariables = {
          title: 'Release ' + doc.tag,
          release: doc,
          tickets: []
        };
        req.jira
          .getIssues(doc.tickets)
          .then((tickets) => {
            var tmp = {}, children = {}, resultTickets = [];
            tickets.forEach((ticket) => {
              tmp[ticket.key] = ticket;
              if (ticket.parent) {
                if (!children[ticket.parent]) {
                  children[ticket.parent] = [];
                }
                children[ticket.parent].push(ticket.key);
              }
            });
            Object.keys(children).forEach((ticket) => {
              tmp[ticket].children = [];
              children[ticket].forEach((child_id) => {
                tmp[ticket].children.push(tmp[child_id]);
                delete tmp[child_id];
              });
            });
            Object.keys(tmp).forEach((ticket) => {
              resultTickets.push(tmp[ticket]);
            });
            templateVariables.tickets = resultTickets;
            res.render('releases/show', templateVariables);
          })

      }
      else {
        var err = new Error('Release not Found');
        err.status = 404;
        next(err);
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
