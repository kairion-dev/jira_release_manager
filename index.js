var Datastore = require('nedb'),
  db = new Datastore({ filename: './db', autoload: true }),
  Git = require("nodegit");

console.log("hello world");

//var doc = { hello: 'world'
//  , n: 5
//  , today: new Date()
//  , nedbIsAwesome: true
//  , notthere: null
//  , notToBeSaved: undefined  // Will not be saved
//  , fruits: [ 'apple', 'orange', 'pear' ]
//  , infos: { name: 'nedb' }
//};
//
//db.insert(doc, function (err, newDoc) {   // Callback is optional
//  // newDoc is the newly inserted document, including its _id
//  // newDoc has no key called notToBeSaved since its value was undefined
//  console.log(newDoc, err);
//});
//
//db.find({hello: 'world'}, function(err, docs) {
//  console.log(docs);
//});

function printCommit(commit, msg) {
  console.log(msg + ' ' + commit.date() + ' ' + commit.sha() + ' ' + commit.message());
}

// Open the repository directory.
var globalRepo;
Git.Repository.openBare("/home/attrib/kairion/kairion.git")
  //.then(function(repo) {
  //  var a = repo.fetch('origin', {
  //    callbacks: [function() {
  //      console.log(args);
  //    }]
  //  });
  //  return a;
  //})
  .then(function(repo) {
    globalRepo = repo;
    return Git.Tag.list(repo);
  })
  .then(function(tagList) {
    var releaseTags = [];
    tagList.forEach(function(tag) {
      if (tag.match(/^\d+\.\d+\.\d+/)) {
        releaseTags.push(tag);
      }
    });
    releaseTags.sort().reverse();
    return releaseTags;
  })
  .then(function(tags) {
//    console.log(tags);
    var commit1;
    globalRepo.getTagByName(tags[0])
      .then(function(tag) {
        return Git.Commit.lookup(tag.owner(), tag.targetId());
      })
      .then(function (commit) {
        commit1 = commit;
        return globalRepo.getTagByName(tags[1]);
      })
      .then(function(tag) {
        return Git.Commit.lookup(tag.owner(), tag.targetId());
      })
      .then(function (commit) {
        var tickets = [];
        console.log('start: ' + commit1.date() + ' ' + commit1.sha());
        console.log('end: ' + commit.date() + ' ' + commit.sha());

        var revwalk = commit1.owner().createRevWalk();
        revwalk.sorting(Git.Revwalk.SORT.REVERSE);
        revwalk.push(commit1.id());

        revwalk.getCommitsUntil(function(c) {
          if (!c || c.sha() == commit.sha()) {
            return false;
          }
          var result = c.message().match(/(K..?-\d+)/);
          if (result && result.length > 1) {
            if (result[1] == 'KD-0') {
              tickets.push(c.message().trim());
            }
            else {
              tickets.push(result[1]);
            }
          }
          return true;
        }).then(function(commits) {
          console.log('Searched commits: ' + commits.length);

          tickets = tickets.filter(function(value, index, self) {
            return self.indexOf(value) === index;
          });
          console.log('Found Tickets: ' + tickets.length + ' = ', tickets);
        })
        .catch(function(e) {
          console.log(e);
        });
      })
      .catch(function(e) {
        console.log(e);
      });
  })
  .catch(function(e) {
    console.log(e);
  });
