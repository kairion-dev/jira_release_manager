"use strict";

var Promise = require('bluebird'),
  log = require('../lib/logger.js'),
  config = require('config'),
  Core = require('../lib/core.js'),
  Webhook = require('./abstract-webhook.js');

var core = new Core();

class CreateTag extends Webhook {

  /**
   * Only process bitbucket requests that contain a repository push.
   * @param  {Object} data
   * @return {Boolean}
   */
  shouldBeExecuted(data) {
    return Promise.resolve(data && data.push);
  };

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
    var args = [ '--git-dir', gitPath , 'fetch' ];

    return spawn('git', args, { capture: [ 'stdout', 'stderr' ] })
      .then((res) => {
        log.info("git fetch for repo '" + repoId + "' " + res.stdout + " " + res.stderr);
        return core.initRepository(repoId); 
      })
      .catch((e) => {
        log.error('Error while executing git fetch for \'' + gitPath + '\': ', e);
      });
  }

}

module.exports = CreateTag;