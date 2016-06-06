var
  fs = require('fs');

var config;

module.exports.config = function(env) {
  // load configs
  if (!config) {
    env = env || 'default';
    config = require('node-yaml-config').load('./config/config.yaml', env);
    if (config.jira && config.jira.oauth && config.jira.oauth.consumer_secret) {
      config.jira.oauth.consumer_secret = fs.readFileSync(process.env['HOME'] + config.jira.oauth.consumer_secret, "utf8");
    }
  }
  return config;
}