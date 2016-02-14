var
  Promise = require("bluebird"),
  kcommon = require('./lib/common.js'),
  Git = require("nodegit"),
  fs = require('fs');

class GitHistory {

  constructor(options) {
    this.git_path = options.git_path;
    this.git_name = options.git_name;
    this.db = options.db;
    this.repo = null;
  }

  /**
   * Initialize git repo and get all tags.
   *
   * @returns {*|Promise.<T>} Array of all new tags.
   */
  initialize() {
    var knownTags = {};
    return db.tags
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
        var releaseTags = [];
        tagList.forEach((tag) => {
          if (tag.match(/^\d+\.\d+\.\d+/)) {
            releaseTags.push(tag);
          }
        });
        releaseTags.sort().reverse();
        return Promise.map(releaseTags, (tag, i, total) => {
          // ignore already processed tags
          if (i == total || knownTags[tag]) {
            return;
          }
          var commit1;
          // First the commit referenced by the tag is needed
          return this.repo.getTagByName(tag)
            .then((tag) => {
              return Git.Commit.lookup(tag.owner(), tag.targetId());
            })
            .then((commit) => {
              commit1 = commit;
              return this.repo.getTagByName(releaseTags[i + 1]);
            })
            // Then the commit reference by the tag before is needed
            .then((tag) => {
              return Git.Commit.lookup(tag.owner(), tag.targetId());
            })
            // Walking through the history and get all tickets in the commit message
            .then((commit) => {
              var tickets = [];
              var revwalk = commit1.owner().createRevWalk();
              revwalk.sorting(Git.Revwalk.SORT.TIME);
              revwalk.push(commit1.id());

              return revwalk.getCommitsUntil(
                (c) => {
                  // currently I use the date to break. Somehow waiting till the sha matches results in all commits
                  // Probably because of the merging shit.
                  // @todo: This means we lose all tickets which were worked on in a feature branch before the release
                  if (!c || c.date() <= commit.date()) {
                    return false;
                  }
                  var result = c.message().match(/^(K..?-\d+)/);
                  if (result && result.length > 1) {
                    if (result[1] == 'KD-0') {
                      tickets.push(c.message().trim());
                    }
                    else {
                      tickets.push(result[1]);
                    }
                  }
                  return true;
                })
                // save all tags with their tickets
                .then((commits) => {
                  tickets = kcommon.uniqueArray(tickets);
                  tickets.sort();
                  var result = {
                    tag: tag,
                    tickets: tickets,
                    commits: commits.length,
                    repository: this.git_name,
                    last_commit_date: commit1.date()
                  };
                  return new Promise((resolve, reject) => {
                    db.tags.update({tag: tag}, {$set: result}, {upsert: true}, (err, numUpdated) => {
                      if (err) reject(err);
                      else resolve(result);
                    });
                  });
                })
                .catch(function(e) {
                  console.log('Error walking though the history of tag ' + tag + ': ' + e);
                });
            })
            .catch(function(e) {
              console.log('Error processing tag ' + tag + ': ' + e);
            });
        });
      })
      .catch((e) => {
        console.log('Error processing all tags: ' + e);
      });
  }
}

module.exports.GitHistory = GitHistory;
