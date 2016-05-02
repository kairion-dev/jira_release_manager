"use strict";

var
	Promise = require('bluebird'),
	fs = Promise.promisifyAll(require('fs-extra')),
	Git = require('nodegit');

class RepositoryGenerator {

	constructor(path) {
		this.path = path;
	}

	clearRepository() {
		return fs.statAsync(this.path)
			.then((stats) => stats.isDirectory() && fs.removeAsync(this.path))
			.catch((e) => {
				if (e.code != 'ENOENT') {
					throw new Error('error', e);
				}
			});
	}

	switchToBranch(name) {
		return this.repo.getBranch(name)
			.then((ref) => this.repo.checkoutBranch(ref))
	}

	mergeBranches(to, from, author) {
		return this.repo.mergeBranches(to, from, author); // , author, Git.Merge.PREFERENCE.NONE, new Git.MergeOptions()
	}

	createCommit(files, author, message) {
		return this.repo.createCommitOnHead(files, author, author, message);
	}

	open() {
		return Git.Repository.open(this.path)
			.then((repo) => {
				this.repo = repo;
				return repo;
			})
	}

	init(branches, author) {
		return this.clearRepository()
			.then(() => Git.Repository.init(this.path, 0))
			.then((repo) => {
				this.repo = repo;
				return repo.openIndex();
			})
			.then((index) => {
				return index.writeTree();
			})
			.then((oid) => {
				return this.repo.createCommit('HEAD', author, author, 'initial commit', oid, []);
			})
			.then((commitId) => {
				return Promise.map(branches, (name) => {
					return this.repo.createBranch(name, commitId, false, author, 'log message?');
				});
			})
	}
}

module.exports.RepositoryGenerator = RepositoryGenerator;


// Generator.clearRepository()
// 	.then(() => Generator.init())
// 	.then(() => {
// 		Generator.repo.getBranch('develop');
// 	})
// 	.catch((e) => {
// 		console.log(e);
// 	})

// Promise.resolve()
	// .then(generator.clearRepository)
	// .then(generator.init)
	// .catch((e) => {
	// 	console.log(e);
	// })

// Promise.resolve(path)
// 	.then(clearRepository)
// 	.then(init)
// 	// .then()
// // 	// .then((branches) => {
// // 	// 	console.log('hier');
// // 	// 	return;
// // 	// 		// 		.then((ref) => {
// // 	// 		// 	return repo.checkoutBranch(ref, new Git.CheckoutOptions());
// // 	// 		// })
// // 	// 		// .then(() => {
// // 	// 		// 	return repo.createCommitOnHead([ file2 ], author, author, 'commit message 2')
// // 	// 		// })
// // 	// })
// // 	// 	return repo.createBranch('branch1', 'commit1', true, author, 'my log message');
// // 	// })
// // 	// .then((ref) => {
// // 	// 	console.log(ref);
// // 	// 	console.log(geklappt);
// // 	// })
// 	.catch((e) => {
// 		console.log(e);
// 		// throw new Error('err', e);
// 	})