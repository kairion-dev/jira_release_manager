"use strict";

var
  log = require('./logger.js'),
  Promise = require("bluebird"),
  kcommon = require('./common.js'),
  Git = require("nodegit"),
  fs = require('fs');

class GitHistory {

  constructor(options, db) {
    this.git_path = options.git_path;
    this.git_name = options.git_name;
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
          knownTags[tag.tag] = tag;
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

        return this.getCommitsForTags(releaseTags)
          .then((destinations) => {
            return Promise.map(releaseTags, (tag, i, total) => {
              // ignore already processed tags
              if (i == total || knownTags[tag]) {
                return;
              }

              // First the commit referenced by the tag is needed
              return this.repo.getTagByName(tag)
                .then((tag) => {
                  return Git.Commit.lookup(tag.owner(), tag.targetId());
                })
                // Walking through the history and get all tickets in the commit message
                .then((commitStart) => {
                  // get all subsequent destinations of the current tag
                  // e.g. releaseTags = [ '15.03', '15.02', '15.01' ], i=1 => [ '15.01' ]
                  var destCommits = destinations.slice(i+1);

                  // find all commits between start and subsequent destinations (release tags)
                  // in the best case, the first destination is already the next logical release tag
                  return this.getCommitsBetween(commitStart, destCommits)
                    // save all tags with their tickets
                    .then((values) => {
                      log.info(tag + '(' + commitStart + ') runs=' + values.runs + ' processedUntilInit=' + values.processedUntilInit);

                      var result = {
                        tag: tag,
                        tickets: values.tickets,
                        commits: values.commits.length,
                        repository: this.git_name,
                        last_commit_date: commitStart.date()
                      };
                      return new Promise((resolve, reject) => {
                        this.db.tags.update({tag: tag}, {$set: result}, {upsert: true}, (err, numUpdated) => {
                          if (err) reject(err);
                          else resolve(result);
                        });
                      });
                    })
                    .catch((e) => {
                      log.error('Error walking though the history of tag ' + tag + ': ' + e);
                    });
                })
                .catch((e) => {
                  log.error('Error processing tag ' + tag + ': ' + e);
                });
            });
          });
      })
      .catch((e) => {
        log.error('Error processing all tags: ' + e);
      });
  }

  /**
   * Get the Git commits for a list of tag names
   * Example: tagNames = [ '15.01', '15.02' ] => [ 'a562b...', '72gj2...' ]
   *
   * @param tagNames
   */
  getCommitsForTags(tagNames) {
    return Promise.map(tagNames, (tagName) => {
      return this.repo.getTagByName(tagName)
        .then((tag) => {
          return Git.Commit.lookup(tag.owner(), tag.targetId());
        });
    })
  }


  /**
   *
   * Get all commits between the start and the next possible destination in the history.
   * Usually the first commit in destCommits should represent the next logical release tag in the history,
   * if not, try to find all commits until the next predecessor and so on until init commit is reached.
   *
   * @param startCommit
   * @param destCommits
   * @returns {*|Promise.<*>}
   */
  getCommitsBetween(startCommit, destCommits) {
    return Promise.resolve(destCommits).then(function helper(destCommits, runs) {
      // set i to 1 in first run, otherwise take the current number of runs
      runs = runs || 1;
      // get the next destination in order to reach it through the history tree
      var destCommit = destCommits.shift();

      // prepare revision walk
      var revwalk = startCommit.owner().createRevWalk();
      revwalk.sorting(Git.Revwalk.SORT.TOPOLOGICAL | Git.Revwalk.SORT.TIME);
      revwalk.push(startCommit.id());

      return revwalk.getCommitsUntil((c) => {
        // get commits until there is no commit left in the history tree or destination is reached
        return !(!c || (destCommit && c.id().equal(destCommit.id())));
      })
      .then((commits) => {
        // get latest commit in the current run
        var lastCommit = commits[commits.length-1];

        // if final destination is reached (or no destinations are left), return all matching tickets
        if (!destCommit || destCommit.id().equal(lastCommit.id())) {
          var tickets = [];
          commits.forEach((c) => {
            var result = c.message().match(/^(K..?-\d+)/);
            if (result && result.length > 1) {
              if (result[1] == 'KD-0') {
                tickets.push(c.message().trim());
              }
              else {
                tickets.push(result[1]);
              }
            }
          });
          tickets = kcommon.uniqueArray(tickets);
          tickets.sort();
          return {'commits': commits, 'tickets': tickets, 'runs': runs, 'processedUntilInit': (typeof destCommit === 'undefined')};
        } else { // otherwise, try with rest of the destinations
          return helper(destCommits, runs+1);
        }
      })
    })
  }

}

module.exports.GitHistory = GitHistory;
