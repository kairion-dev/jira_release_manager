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
    this.db = db;
    this.repo = null;
  }

  /**
   * Initialize git repo and get all tags.
   *
   * @returns {*|Promise.<T>} Array of all new tags.
   */
  initialize() {
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
        releaseTags.sort().reverse();

        return Promise.map(releaseTags, (tag, i, total) => {
          // ignore already processed tags
          if (knownTags[tag]) {
            return;
          }
          var predecessor = releaseTags[i+1];
          return this.gitLog(tag, predecessor)
            .then((commits) => {
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
            })
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
    var exec = require('child-process-promise').exec;

    var range = commitPredecessor ? commitPredecessor + '..' + commitCurrent : commitCurrent;

    // git command to get all commits with hash, author, date and message within commitStart and commitEnd
    var command = 'git --git-dir ' + this.git_path
      + ' log --pretty=format:"{^^id^^:^^%H^^, ^^author^^:^^%an^^, ^^date^^:^^%ad^^, ^^message^^:^^%B^^}^END^" '
      + range;

    return exec(command)
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
