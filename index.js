var Datastore = require('nedb'),
  Git = require("nodegit"),
  Promise = require("bluebird"),
  db = {};

db.tags = new Datastore({ filename: './tags', autoload: true });

// Open the repository directory.
var globalRepo;
Git.Repository.openBare("/home/attrib/kairion/kairion.git")
  //.then(function(repo) {
  // @todo: auth
  //  return repo.fetch('origin');
  //})
  .then((repo) => {
    // @todo: how is this done better?
    globalRepo = repo;
    return Git.Tag.list(repo);
  })
  .then((tagList) => {
    var releaseTags = [];
    tagList.forEach(function(tag) {
      if (tag.match(/^\d+\.\d+\.\d+/)) {
        releaseTags.push(tag);
      }
    });
    releaseTags.sort().reverse();//.splice(10, releaseTags.length - 10);
    return Promise.map(releaseTags, (tag, i, total) => {
      if (i == total) {
        return;
      }
      var commit1;
      return globalRepo.getTagByName(tag)
        .then(function(tag) {
          return Git.Commit.lookup(tag.owner(), tag.targetId());
        })
        .then(function (commit) {
          commit1 = commit;
          return globalRepo.getTagByName(releaseTags[i + 1]);
        })
        .then(function(tag) {
          return Git.Commit.lookup(tag.owner(), tag.targetId());
        })
        .then(function (commit) {
          var tickets = [];
          console.log('start: ' + commit1.date() + ' ' + commit1.sha());
          console.log('end: ' + commit.date() + ' ' + commit.sha());

          var revwalk = commit1.owner().createRevWalk();
          revwalk.sorting(Git.Revwalk.SORT.TIME);
          revwalk.push(commit1.id());

          return revwalk.getCommitsUntil(
            function(c) {
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
            .then(function(commits) {
              tickets = tickets.filter(function(value, index, self) {
                return self.indexOf(value) === index;
              });
              tickets.sort();
              // @todo: how to return now only when callback was finished?
              var result = {tag: tag, tickets: tickets, commits: commits.length};
              db.tags.update({tag: tag}, {$set: result}, {upsert: true});
              return result;
            })
            .catch(function(e) {
              console.log(e);
            });
        })
        .catch(function(e) {
          console.log(e);
        });
    });
  })
  .then(function(tags) {
    console.log(tags);
  })
  .then(() => {
    console.log('next');
  })
  .finally(() => {
    console.log('finished');
  })
  .catch((e) => {
    console.log(e);
  });
