var
  Promise = require("bluebird"),
  kcommon = require('./lib/common.js'),
  Datastore = Promise.promisifyAll(require('nedb')),
  Git = require("nodegit"),
  db = {
    tags: Promise.promisifyAll(new Datastore({ filename: './tags', autoload: true })),
    tickets: Promise.promisifyAll(new Datastore({ filename: './tickets', autoload: true }))
  },
  JiraApi = require('./lib/jira.js').Jira,
  jira = new JiraApi({
    host: 'kairion.atlassian.net',
    username: 'kfritsche',
    password: 'xxxxxxxx',
    epicsKey: 'customfield_10500',
    newCapKey: 'customfield_13103'
  });

// @todo: are there better ways for this globals?
var globalRepo, knownTags = {};

db.tags
  .findAsync({})
  .then((docs) => {
    return Promise.map(docs, (tag, i, total) => {
      knownTags[tag.tag] = tag;
    })
  })
  // Open the repository directory.
  .then(() => {return Git.Repository.openBare("/home/attrib/kairion/kairion.git")})
  //.then(function(repo) {
  // @todo: auth
  //  return repo.fetch('origin');
  //})
  // Get list of tags
  .then((repo) => {
    globalRepo = repo;
    return Git.Tag.list(repo);
  })
  // Retrieve the Tickets for each tag
  .then((tagList) => {
    var releaseTags = [];
    tagList.forEach(function(tag) {
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
      return globalRepo.getTagByName(tag)
        .then(function(tag) {
          return Git.Commit.lookup(tag.owner(), tag.targetId());
        })
        .then(function (commit) {
          commit1 = commit;
          return globalRepo.getTagByName(releaseTags[i + 1]);
        })
        // Then the commit reference by the tag before is needed
        .then(function(tag) {
          return Git.Commit.lookup(tag.owner(), tag.targetId());
        })
        // Walking through the history and get all tickets in the commit message
        .then(function (commit) {
          var tickets = [];
          var revwalk = commit1.owner().createRevWalk();
          revwalk.sorting(Git.Revwalk.SORT.TIME);
          revwalk.push(commit1.id());

          return revwalk.getCommitsUntil(
            function(c) {
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
            .then(function(commits) {
              tickets = kcommon.uniqueArray(tickets);
              tickets.sort();
              var result = {tag: tag, tickets: tickets, commits: commits.length};
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
  .then((tags) => {
    console.log('Processed all tags.');
//    console.log(tags);
    // Updating ALL known tickets
    var tickets_to_process = [];
    return db.tags.findAsync({})
      .map((doc) => {
        return Promise.map(doc.tickets,
          (ticket) => {
            if (!ticket.startsWith('KD-0')) {
              tickets_to_process.push(ticket);
            }
          })
      })
      .then(() => {
        return kcommon.uniqueArray(tickets_to_process);
      })
      .then((tickets) => {
        var fetchedIssues = {};
        db.tickets.findAsync({})
          .map((ticket) => {
            fetchedIssues[ticket.key] = ticket;
          })
          .then(() => {
            return Jira.fetchIssues(tickets, {fetchParents: true, fetchedIssues: fetchedIssues})
          });
      })
  })
  .catch((e) => {
    console.log('Error processing all tags: ' + e);
  });
