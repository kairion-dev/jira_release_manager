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
			.then((ref) => this.repo.checkoutBranch(ref));
	}

	mergeBranches(to, from, author) {
		return this.repo.mergeBranches(to, from, author);
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

	createRemote(remoteUrl) {
		this.remote = Git.Remote.create(this.repo, "origin", remoteUrl);
		return Promise.resolve(this.remote);
	}

	push(branch) {
		return this.remote.push(["refs/heads/" + branch + ":refs/heads/" + branch]);
	}

	pull(branch) {
		return this.repo.fetchAll()
			.then(() => this.repo.mergeBranches(branch, 'origin/' + branch));
	}

	initOnly(isBare) {
		isBare = isBare || 0;
		return this.clearRepository()
			.then(() => Git.Repository.init(this.path, isBare))
			.then((repo) => {
				this.repo = repo;
				return repo.openIndex();
			})
			.then((index) => {
				return index.writeTree();
			})
	}

	init(branches, author, isBare) {
		isBare = isBare || 0;
		return this.clearRepository()
			.then(() => Git.Repository.init(this.path, isBare))
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