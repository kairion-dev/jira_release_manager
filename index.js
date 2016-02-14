var
  Promise = require("bluebird"),
  kcommon = require('./lib/common.js'),
  Datastore = Promise.promisifyAll(require('nedb')),
  JiraApi = require('./lib/jira.js').Jira,
  Git = require("./lib/git.js"),
  fs = require('fs'),
  db = {
    tags: Promise.promisifyAll(new Datastore({ filename: './tags', autoload: true })),
    tickets: Promise.promisifyAll(new Datastore({ filename: './tickets', autoload: true }))
  },
  jira = new JiraApi({
    host: 'kairion.atlassian.net',
    epicsKey: 'customfield_10500',
    newCapKey: 'customfield_13103',
    oauth: {
      consumer_key: '',
      consumer_secret: fs.readFileSync(process.env['HOME'] + '/.ssh/jira_rsa', "utf8"),
      access_token: '',
      access_token_secret: ''
    },
    db: db
  }),
  git = Git.GitHistory({
    git_path: '/home/attrib/kairion/kairion.git',
    git_name: 'kairion',
    db: db
  });

git
  .initialize()
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
            console.log('Already fetched ' + Object.keys(fetchedIssues).length + ' issues from ' + tickets.length);
            return jira.fetchIssues(tickets, {fetchParents: true, fetchedIssues: fetchedIssues})
          });
      })
  })
  .catch((e) => {
    console.log('Error processing all tags: ' + e);
  });
