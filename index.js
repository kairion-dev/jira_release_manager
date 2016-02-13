var
  Promise = require("bluebird"),
  Datastore = Promise.promisifyAll(require('nedb')),
  Git = require("nodegit"),
  db = {};

db.tags = new Datastore({ filename: './tags', autoload: true });
db.tags = Promise.promisifyAll(db.tags);

// @todo: are there better ways for this globals?
var globalRepo, knownTags = {};

db.tags.findAsync({})
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
              tickets = tickets.filter(function(value, index, self) {
                return self.indexOf(value) === index;
              });
              tickets.sort();
              var result = {tag: tag, tickets: tickets, commits: commits.length};
              db.tags.update({tag: tag}, {$set: result}, {upsert: true});
              return result;
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
  .then(function(tags) {
//    console.log(tags);
  })
  .catch((e) => {
    console.log('Error processing all tags: ' + e);
  });
