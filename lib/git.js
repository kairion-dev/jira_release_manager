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
  }


  /**
   * Initialize the git data that means: get all tags and open branches.
   * 
   * @return {Promise}
   */
  initialize() {
    return Promise.all([this.initOpenBranches(), this.initTags()]);
  }


  /**
   * Initialize open branches
   * 
   * @return {Promise}
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
      .then(() => Git.Repository.openBare(this.git_path))
      // get all branches from current repository
      .then((repo) => repo.getReferenceNames(Git.Reference.TYPE.LISTALL))
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
          return this.gitLog('develop', this.feature_prefix + tag)
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
   * @returns {Promise}
   */
  initTags() {
    var knownTags = {};
    var latestReleaseTag;
    var repo;

    return this.db.tags
      // release tags are final, tags like release-branches still can be updated
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
      // Open the repository directory
      .then(() => Git.Repository.openBare(this.git_path))
      // Get list of tags
      .then((repository) => {
        repo = repository;
        return Git.Tag.list(repo);
      })
      .then((tagList) => tagList.filter((tag) => tag.match(/^\d+\.\d+\.\d+/)).sort().reverse())
      // Retrieve the Tickets for each tag
      .then((releaseTags) => {
        // store the latest release tag to compare with current release branch later on
        latestReleaseTag = releaseTags[0];
        return Promise.map(releaseTags, (tag, i, total) => {
          // ignore already processed tags
          if (knownTags[tag]) { return; }

          var predecessor = releaseTags[i+1];
          return this.gitLog(predecessor, tag)
            .then((commits) => this.storeTag(tag, commits, 'release'))
            .catch((e) => {
              log.error('Error processing tag \'' + tag + "\': " + e);
            })
        });
      })
      .then(() => this.initNextRelease())
      .then(() => this.initNextReleaseBranch(repo, latestReleaseTag))
      .catch((e) => {
        log.error('Error processing all tags: ' + e);
      });
  }


  /**
   * Initialize the upcoming release, which means all commits (and related tickets) that are currently under develop
   * 
   * @return {Promise}
   */
  initNextRelease() {
    return this.db.tags.removeAsync({ type: 'release', tag: 'Next Release', repository: this.git_name })
      .then(() => this.gitLog('master', 'develop'))
      .then((commits) => this.storeTag('Next Release', commits, 'release'))
      .catch((e) => {
        log.error('Error processing \'Next Release\':' + e);
      })
  }


  /**
   * Handle the next release branch as it is already a tag (in order to add/remove status)
   * 
   * @param  {Git.Repository} repo
   * @param  {String} latestReleaseTag
   * @return {Promise}
   */
  initNextReleaseBranch(repo, latestReleaseTag) {
    return Git.Reference.list(repo)
      .then((refList) => {
        return refList.filter((ref) => ref.match(/^refs\/heads\/release/)).sort().pop();
      })
      .then((releaseBranch) => {
        let tag = releaseBranch ? releaseBranch.match(/\d+\.\d+\.\d+/)[0] : undefined;
        // only deal with latest release-branch as a tag as long as the tag does not already exist
        if (tag && latestReleaseTag != tag) {
          log.info('current release-branch:', tag, 'latest tag:', latestReleaseTag, '-> handle release-branch as tag');
          return this.gitLog(latestReleaseTag, releaseBranch)
          .then((commits) => {
            return this.storeTag(tag, commits, 'release', true);
          })
          .catch((e) => {
            log.error('Error processing \'My Release\':' + e);
          })
        }
      })
  }


  /**
   * Extract possible manual change lines from the commit message.
   * That means parsing them and removing them from the original message.
   * 
   * @param  {String} commitMessage
   * @return { commitMessage: String, manualChanges: {Array{String}} }
   */
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
  * @return {Promise<Array<TagDoc>>} the new tag documents
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
      // do not return the update result (which means number of updated docs) but the inserted docs themselves
      .then(() => result)
  }


  /**
   * Get all commits within commitSince and commitUntil.
   * Example: gitLog('master', 'feature1') does the exact same as the console command 'git log master..feature1'
   *
   * If only one of them, either commitSince or commitUntil, is passed, it will be used solely.
   * Example: gitLog(undefined, 'feature1') equals 'git log feature1' 
   *
   * @param commitSince
   * @param commitUntil
   * @returns {Promise<Array<Commit>>}
   */
  gitLog(commitSince, commitUntil) {
    var spawn = require('child-process-promise').spawn;

    var range = commitSince && commitUntil ? commitSince + '..' + commitUntil : commitSince || commitUntil;

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
