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
    return Promise.all([this.initOpenBranches(), this.initTags()]);
  }

  /**
   * Initialize open branches
   * 
   * @return {[type]} [description]
   */
  initOpenBranches() {
    var knownTags = {};
    return this.db.tags.removeAsync({ type: 'branch', repository: this.git_name }, { multi: true }) // quick fix to be able to update open branches
      .then(() => this.db.tags.findAsync({ type: 'branch', repository: this.git_name }))
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
    var latestReleaseTag;

    return this.db.tags
      // final tags are already known and final, tags like release-branches still can be updated
      // important: {... $not: { preliminary: true } ...} is NOT the same as {... preliminary: false ...}
      // because the first query is also true if there is no 'preliminary' field
      .findAsync({ type: 'release', repository: this.git_name, $not: { preliminary: true }})
      .then((docs) => {
        return Promise.map(docs, (tag, i, total) => {
          if (tag.repository == this.git_name) {
            knownTags[tag.tag] = tag;
          }
        })
      })
      // Open the repository directory.
      .then(() => {return Git.Repository.openBare(this.git_path)})
      // Get list of tags
      .then((repo) => {
        this.repo = repo;
        return Git.Tag.list(repo);
      })
      .then((tagList) => tagList.filter((tag) => tag.match(/^\d+\.\d+\.\d+/)).sort().reverse())
      // Retrieve the Tickets for each tag
      .then((releaseTags) => {
        // store the latest release tag to compare with current release branch later on
        latestReleaseTag = releaseTags[0];
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
      // Handle 'Next Release'
      .then(() => {
        return this.db.tags.removeAsync({ type: 'release', tag: 'Next Release', repository: this.git_name })
          .then(() => this.gitLog('develop', 'master'))
          .then((commits) => this.storeTag('Next Release', commits, 'release'))
          .catch((e) => {
            log.error('Error processing \'Next Release\':' + e);
          })
      })
      // Handle the next release branch as it is already a tag (in order to add/remove status)
      .then(() => Git.Reference.list(this.repo))
      .then((refList) => {
        return refList.filter((ref) => ref.match(/^refs\/heads\/release/)).sort().pop();
      })
      .then((releaseBranch) => {
        let tag = releaseBranch ? releaseBranch.match(/\d+\.\d+\.\d+/)[0] : undefined;
        // only deal with latest release-branch as a tag as long as the tag does not already exist
        if (tag && latestReleaseTag && latestReleaseTag != tag) {
          log.info('current release-branch:', tag, 'latest tag:', latestReleaseTag, '-> handle release-branch as tag');
          return this.gitLog(releaseBranch, latestReleaseTag)
          .then((commits) => {
            return this.storeTag(tag, commits, 'release', true);
          })
          .catch((e) => {
            log.error('Error processing \'My Release\':' + e);
          })
        }
      })
      .catch((e) => {
        log.error('Error processing all tags: ' + e);
      });
  }

  extractManualChanges(commitMessage) {
    // get all manualchange lines or return an empty array
    var matches = commitMessage.match(/\nmanualchange:(.*)/g) || [];
    // remove manual changes from commit message and collect them at the same time
    var manualChanges = matches.map((match) => {
      commitMessage = commitMessage.replace(match ,'');
      return match.replace('\nmanualchange:', '').trim();
    });
    return { commitMessage: commitMessage, manualChanges: manualChanges };
  }

  /**
  * Store tag data but keep a possible testing and deploy status that was set in the past (e.g. for a release-branch).
  *
  * @param tag
  * @param commits
  * @param type
      string 'release' | 'branch'
  * @param {Boolean} preliminary
  *   true if not a final tag, e.g. a release-branch that will become a final tag
  *   false otherwise (default)
  */
  storeTag(tag, commits, type, preliminary) {
    preliminary = preliminary || false;
    var tickets = [];
    var numOfMerges = 0;
    var manualChanges = [];

    commits.forEach((c) => {
      let res = this.extractManualChanges(c.message.trim());
      let message = res.commitMessage;
      manualChanges = manualChanges.concat(res.manualChanges);

      let result = message.match(/^(K..?-\d+)/);
      if (result && result.length > 1) {
        if (result[1] != 'KD-0') {
          tickets.push(result[1]);
        } else {
          tickets.push(message);
        }
      } else {
        if (message.startsWith('Merge')) {
          numOfMerges++;
        } else {
          tickets.push('KD-0 ' + message);
        }
      }
    });
    tickets = kcommon.uniqueArray(tickets);
    tickets.sort();

    if (commits.length == 0 && numOfMerges == 0) {
      return Promise.resolve();
    }

    var result = {
      tag: tag,
      type: type,
      tickets: tickets,
      commits: commits.length - numOfMerges,
      merges: numOfMerges,
      repository: this.git_name,
      preliminary: preliminary,
      manual_changes: manualChanges,
      last_commit_date: commits[0].date,
      release: { testing: [], deploy: [] }
    };

    return this.db.tags.findAsync({ type: type, tag: tag, repository: this.git_name })
      .then((foundTag) => {
        // if status data already exists, only update the remaining ticket but keep the status data
        if (foundTag[0]) {
          result.release = foundTag[0].release;
        }
        return this.db.tags.updateAsync({type: type, tag: tag, repository: this.git_name}, {$set: result}, {upsert: true})
      })
      .then((numUpdated) => result)
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
