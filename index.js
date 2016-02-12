var Datastore = require('nedb'),
  db = new Datastore({ filename: './db', autoload: true });

console.log("hello world");

var doc = { hello: 'world'
  , n: 5
  , today: new Date()
  , nedbIsAwesome: true
  , notthere: null
  , notToBeSaved: undefined  // Will not be saved
  , fruits: [ 'apple', 'orange', 'pear' ]
  , infos: { name: 'nedb' }
};

db.insert(doc, function (err, newDoc) {   // Callback is optional
  // newDoc is the newly inserted document, including its _id
  // newDoc has no key called notToBeSaved since its value was undefined
  console.log(newDoc, err);
});

db.find({hello: 'world'}, function(err, docs) {
  console.log(docs);
});
