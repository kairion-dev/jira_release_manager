var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Jira Release Manager', repositories: req.repositories, selectedRepository: req.selectedRepository });
});

module.exports = router;
