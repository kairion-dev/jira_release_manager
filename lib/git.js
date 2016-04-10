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

  initOpenBranches() {
    var knownBranches = {};
    return this.db.openBranches
      .findAsync({})
      .then((docs) => {
        return Promise.map(docs, (branch, i, total) => {
          if (branch.repository == this.git_name) {
            knownBranches[branch.branch] = branch;
          }
        })
      })
      .then(() => { return Git.Repository.openBare(this.git_path); })
      .then((repo) => {
        return repo.getReferenceNames(Git.Reference.TYPE.LISTALL);
      })
      .then((references) => {
        return Promise.filter(references, (ref) => {
          return ref.indexOf(this.feature_prefix) != -1
        })
      })
      .then((branches) => {
        return Promise.map(branches, (branch) => {
          branch = branch.replace(this.feature_prefix, '');
          // ignore already processed tags
          if (knownBranches[branch]) {
            return;
          }
          return this.gitLog(this.feature_prefix + branch, 'develop')
            .then(this.prepareTickets)
            .then((res) => {
              if (res.commits.length == 0) {
                return Promise.resolve();
              }

              var result = {
                branch: branch,
                tickets: res.tickets,
                commits: res.commits.length,
                repository: this.git_name,
                last_commit_date: res.commits[0].date,
                release: { testing: [], deploy: [] }
              };

              return new Promise((resolve, reject) => {
                this.db.openBranches.insert(result, (err, numUpdated) => {
                  if (err) reject(err);
                  else resolve(result);
                });
              });
            })
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
      .findAsync({})
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
        releaseTags.push('master');
        releaseTags.sort().reverse();

        return Promise.map(releaseTags, (tag, i, total) => {
          // ignore already processed tags
          if (knownTags[tag]) {
            return;
          }
          var predecessor = releaseTags[i+1];

          return this.gitLog(tag, predecessor)
            .then(this.prepareTickets)
            .then((res) => {
              if (res.commits.length == 0) {
                return Promise.resolve();
              }

              var result = {
                tag: tag,
                tickets: res.tickets,
                commits: res.commits.length,
                repository: this.git_name,
                last_commit_date: res.commits[0].date,
                release: { testing: [], deploy: [] }
              };
              return new Promise((resolve, reject) => {
                this.db.tags.update({tag: tag, repository: this.git_name}, {$set: result}, {upsert: true}, (err, numUpdated) => {
                  if (err) reject(err);
                  else resolve(result);
                });
              });
            })
            .catch((e) => {
              log.error('Error processing tag \'' + tag + "\': " + e);
            })
        });
      })
      .catch((e) => {
        log.error('Error processing all tags: ' + e);
      });
  }

  prepareTickets(commits) {
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
    return {'commits': commits, 'tickets': tickets};
  }

  /**
   * Get the Git commits for a list of tag names
   * Example: tagNames = [ '15.01', '15.02' ] => [ Commit{ id: 'a562b...', }, Commit{ id: '72gj2...', } ]
   *
   * @param tagNames
   */
  getCommitsForTags(tagNames) {
    return Promise.map(tagNames, (tagName) => {
      return this.repo.getTagByName(tagName)
        .then((tag) => {
          return Git.Commit.lookup(tag.owner(), tag.targetId());
        })
        .catch((e) => {
          log.error('Error getting commit for tag: ' + tagName + ': ' + e);
        });
    })
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

    commitPredecessor = (commitCurrent == 'master' ? 'develop' : commitPredecessor ); // hack to get the difference between develop..master as soon as current commit is master
    var range = commitPredecessor ? commitPredecessor + '..' + commitCurrent : commitCurrent;

    // git args to get all commits with hash, author, date and message within commitStart and commitEnd
    // var args = 'git --git-dir ' + this.git_path
    //   + ' log master --pretty=format:"{^^id^^:^^%H^^, ^^author^^:^^%an^^, ^^date^^:^^%ad^^, ^^message^^:^^%B^^}^END^" '
    //   + range;

    var args = [ '--git-dir', this.git_path, 'log', '--pretty=format:{^^id^^:^^%H^^, ^^author^^:^^%an^^, ^^date^^:^^%ad^^, ^^message^^:^^%B^^}^END^', range ];

    return spawn('git', args, { capture: [ 'stdout', 'stderr' ] })
      .then ((res) => {
        var commits = [];
        res.stdout.split('^END^').forEach((commit) => {
          if (commit.length > 0) {
            let commitEscaped = commit.trim()
              .replace(/"/gm, '\\"') // escape quotes in commit message
              .replace(/\n/gm, '\\n') // escape newlines
              .replace(/\t/gm, '\\t') // escape tabs
              .replace(/\^\^/gm, '"'); // replace ^^ with " to form a valid json string
            let commitJson = JSON.parse(commitEscaped);
            commits.push(commitJson);
          }
        });
        return commits;
      })
      .catch((e) => {
        log.error('Error while executing git log: ', e);
      });
  }

}

module.exports.GitHistory = GitHistory;
