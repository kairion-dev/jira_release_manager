var express = require('express');
var router = express.Router();

/* GET index page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Open Branches', repositories: req.repositories, selectedRepository: req.selectedRepository });
});

module.exports = router;
