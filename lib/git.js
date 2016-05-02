"use strict";

var
  log = require('./logger.js'),
  Promise = require("bluebird"),
  kcommon = require('./common.js'),
  Git = require("nodegit"),
  fs = require('fs');

class GitHistory {

  constructor(options, db) {
    this.git_path = options.path;
    this.git_name = options.name;
    this.feature_prefix = options.feature_prefix;
    this.db = db;
    this.repo = null;
  }

  /**
   * Initialize the git data that means: get all tags and open branches.
   * @return {[type]} [description]
   */
  initialize() {
    return Promise.all([this.initOpenBranches(), this.initTags()])
  }

  /**
   * Initialize open branches
   * 
   * @return {[type]} [description]
   */
  initOpenBranches() {
    var knownTags = {};
    return this.db.tags
      .findAsync({ type: 'branch' })
      .then((docs) => {
        return Promise.map(docs, (branch, i, total) => {
          if (branch.repository == this.git_name) {
            knownTags[branch.branch] = branch;
          }
        })
      })
      .then(() => { return Git.Repository.openBare(this.git_path); })
      .then((repo) => {
        // get all branches from current repository
        return repo.getReferenceNames(Git.Reference.TYPE.LISTALL);
      })
      .then((references) => {
        // only take feature branches
        return Promise.filter(references, (ref) => {
          return ref.indexOf(this.feature_prefix) != -1
        })
      })
      .then((branches) => {
        return Promise.map(branches, (tag) => {
          tag = tag.replace(this.feature_prefix, '');
          // ignore already processed tags
          if (knownTags[tag]) {
            return;
          }
          return this.gitLog(this.feature_prefix + tag, 'develop')
            .then((commits) => this.storeTag(tag, commits, 'branch'))
            .catch((e) => {
              log.error('Error processing branch \'' + branch + "\': " + e);
            })
        })
      })
      .catch((e) => {
        log.error('Error processing open branches: ' + e);
      });
  }

  /**
   * Initialize git repo and get all tags.
   *
   * @returns {*|Promise.<T>} Array of all new tags.
   */
  initTags() {
    var knownTags = {};
    return this.db.tags
      .findAsync({ type: 'release' })
      .then((docs) => {
        return Promise.map(docs, (tag, i, total) => {
          if (tag.repository == this.git_name) {
            knownTags[tag.tag] = tag;
          }
        })
      })
      // Open the repository directory.
      .then(() => {return Git.Repository.openBare(this.git_path)})
      //.then((repo) => {
      // @todo: auth
      //  return repo.fetch('origin');
      //})
      // Get list of tags
      .then((repo) => {
        this.repo = repo;
        return Git.Tag.list(repo);
      })
      // Retrieve the Tickets for each tag
      .then((tagList) => {
        // filter invalid tags
        var releaseTags = tagList.filter((tag) => tag.match(/^\d+\.\d+\.\d+/));
        // add 'next release' to list, which means difference develop to master
        releaseTags.push('master');
        releaseTags.sort().reverse();

        return Promise.map(releaseTags, (tag, i, total) => {
          // ignore already processed tags
          if (knownTags[tag]) {
            return;
          }
          var predecessor = releaseTags[i+1];

          return this.gitLog(tag, predecessor)
            .then((commits) => this.storeTag(tag, commits, 'release'))
            .catch((e) => {
              log.error('Error processing tag \'' + tag + "\': " + e);
            })
        });
      })
      .catch((e) => {
        log.error('Error processing all tags: ' + e);
      });
  }

  /**
  * Store tag data in db.
  *
  * @param tag
  * @param commits
  * @param type
      string 'release' | 'branch'
  */
  storeTag(tag, commits, type) {
    var tickets = [];
    commits.forEach((c) => {
      var result = c.message.match(/^(K..?-\d+)/);
      if (result && result.length > 1) {
        if (result[1] == 'KD-0') {
          tickets.push(c.message.trim());
        }
        else {
          tickets.push(result[1]);
        }
      }
    });
    tickets = kcommon.uniqueArray(tickets);
    tickets.sort();

    if (commits.length == 0) {
      return Promise.resolve();
    }

    var result = {
      tag: tag,
      type: type,
      tickets: tickets,
      commits: commits.length,
      repository: this.git_name,
      last_commit_date: commits[0].date,
      release: { testing: [], deploy: [] }
    };
    return new Promise((resolve, reject) => {
      this.db.tags.update({type: type, tag: tag, repository: this.git_name}, {$set: result}, {upsert: true}, (err, numUpdated) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }


  /**
   * Get all commits within commitStart and commitEnd (using git log).
   *
   * @param commitCurrent
   * @param commitPredecessor
   * @returns {*|Promise.<T>}
   */
  gitLog(commitCurrent, commitPredecessor) {
    var spawn = require('child-process-promise').spawn;

    // hack to get the difference between develop..master as soon as current commit is master
    if (commitCurrent == 'master') {
      commitCurrent = 'develop';
      commitPredecessor = 'master';
    }

    var range = commitPredecessor ? commitPredecessor + '..' + commitCurrent : commitCurrent;

    var args = [ '--git-dir', this.git_path, 'log', '--pretty=format:{^^id^^:^^%H^^, ^^author^^:^^%an^^, ^^date^^:^^%ad^^, ^^message^^:^^%B^^}^END^', range ];

    return spawn('git', args, { capture: [ 'stdout', 'stderr' ] })
      .then ((res) => {
        var commits = [];
        res.stdout.split('^END^').forEach((commit) => {
          if (commit.length > 0) {
            let commitEscaped = commit.trim()
              .replace(/\\/gm, '\\\\') // escape \ 
              .replace(/"/gm, '\\"') // escape quotes in commit message
              .replace(/\r?\n|\r/g, "\\n")  // escape newlines
              .replace(/\t/gm, '\\t') // escape tabs
              .replace(/\^\^/gm, '"'); // replace ^^ with " to form a valid json string
            let commitJson = JSON.parse(commitEscaped);
            commits.push(commitJson);
          }
        });
        return commits;
      })
      .catch((e) => {
        log.error('Error while executing git log for \'' + commitCurrent + '\': ', e);
      });
  }

}

module.exports.GitHistory = GitHistory;
