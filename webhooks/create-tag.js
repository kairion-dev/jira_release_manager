"use strict";

var Promise = require('bluebird'),
  log = require('../lib/logger.js').webhooks,
  config = require('config'),
  Core = require('../lib/core.js'),
  Webhook = require('./abstract-webhook.js');

var core = new Core();

class CreateTag extends Webhook {

  /**
   * Only process bitbucket requests that contain a repository push.
   * 
   * @param  {Object} data
   * @return {Promise<Boolean>}
   */
  shouldBeExecuted(data) {
    return Promise.resolve(data && data.push);
  };

  description() {
    return 'Reinitialize repository if data is pushed in order to get new tags for the release page.';
  }

  /**
   * Reinitialize updated repository in order to get new tags for the release page.
   * 
   * @param  {Object} data
   * @return {Promise}
   */
  invoke(data) {
    if (!data.repository || !data.repository.name) {
      return Promise.reject('data.repository.name must be defined');
    }
    var repoId = data.repository.name;

    if (!config.has('git.repositories.' + repoId)) {
      return Promise.reject('config does not contain a repository called \'' + data.repository.name + '\'');
    }

    var gitPath = config.get('git.repositories.' + repoId + '.path');
    var spawn = require('child-process-promise').spawn;

    return spawn('git', [ '--git-dir', gitPath, 'remote', 'prune', 'origin' ]) // delete all local repositories that have already been deleted remotely
      .then(() => spawn('git', [ '--git-dir', gitPath , 'fetch' ], { capture: [ 'stdout', 'stderr' ] }))
      .then((res) => {
        log.info("git fetch for repo '" + repoId + "' " + res.stdout + " " + res.stderr);
        return core.initRepository(repoId); 
      })
      .then((res) => {
        return { tickets: res.length };
      })
      .catch((e) => {
        log.error('Error while executing git fetch for \'' + gitPath + '\': ', e);
      });
  }

}

module.exports = CreateTag;