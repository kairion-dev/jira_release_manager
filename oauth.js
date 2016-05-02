var
  fs = require('fs'),
  OAuth = require('oauth').OAuth,
  readline = require('readline'),
  request = require('request'),
  configFile = require('config');

var config = {
  host: 'https://kairion.atlassian.net',
  consumer: configFile.get('jira.oauth.consumer_key'),
  consumer_secret: fs.readFileSync(configFile.get('jira.oauth.consumer_secret'), "utf8")
};

var consumer =
  new OAuth(
    config.host + '/plugins/servlet/oauth/request-token',
    config.host + '/plugins/servlet/oauth/access-token',
    config.consumer,
    config.consumer_secret,
    "1.0",
    "https://kairion.de/oauth",
    "RSA-SHA1",
    null,
    {
      "Accept" : "application/json",
      "Connection" : "close",
      "User-Agent" : "Node authentication",
      "Content-Type" : "application/json"
    }
  );

consumer.getOAuthRequestToken(
  function (error, oauthToken, oauthTokenSecret, results) {
    if (error) {
      console.log('Error: ', error);
    }
    else {
      console.log(results);
      console.log('oauthRequestToken: ' + oauthToken);
      console.log('oauthRequestTokenSecret: ' + oauthTokenSecret);
      console.log('Open url: ' + config.host + '/plugins/servlet/oauth/authorize?oauth_token=' + oauthToken);
      var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      rl.question('oauth verifier: ', (oauth_verifier) => {
        oauth_verifier = oauth_verifier.trim();
        consumer.getOAuthAccessToken (
          oauthToken,
          oauthTokenSecret,
          oauth_verifier,
          function(error, oauthAccessToken, oauthAccessTokenSecret, results){
            if (error) {
              console.log('Error: ', error);
              rl.close();
            }
            else {
              console.log('Result: ', results);
              console.log('oauthAccessToken: ' + oauthAccessToken);
              console.log('oauthAccessTokenSecret: ' + oauthAccessTokenSecret);
              rl.close();
            }
          }
        );
      });
    }
  }
);
