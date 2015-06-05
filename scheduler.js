var got = require('got');
var gh_got = require('gh-got');
var cron_job = require('cron').CronJob;

var last_key = null;
var etags = { }

var crandb = process.env.CRANDB_URL || 'http://crandb.r-pkg.org';
var docsdb = process.env.DOCSDB_URL || 'http://docs.r-pkg.org:5984';
var gh_token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || null;

var nano = require('nano')(docsdb);
var db = nano.db.use('gh-stars');

// We run this every ten seconds. Get the next
// package, and update its star count.

var job = new cron_job('*/2 * * * * *', function() {

    get_package(function(err, data) {
	if (err) { console.log(err); return; }
	var repo_field, repo;
	if (data.BugReports &&
		   data.BugReports.match(/https?:\/\/github\.com\//)) {
	    repo_field = data.BugReports;
	} else if (data.URL && data.URL.match(/https?:\/\/github\.com\//)) {
	    repo_field = data.URL;
	} else {
	    repo_field = "";
	}
	repo = repo_field
	    .replace(/^[\s\S]*https?:\/\/github\.com\/([^\/]+\/[^\/, ]+)\/?[\s\S]*$/m, '$1');

	if (repo) {
	    console.log("Updating ", data.Package, " repo: ", repo);
	    update_stars(data.Package, repo)
	}
    })

}, null, true, 'America/New_York');

function get_package(callback) {

    get_package_name(function(err, data) {
	if (err) { callback(err); return; }
	var url = crandb + '/' + data;
	got(url, function(err, data, res) {
	    if (err) { callback(err); return; }
	    callback(null, JSON.parse(data));
	})
    });

}

function get_package_name(callback) {

    if (!last_key) {
	// get first package
	var url = crandb + '/-/desc?limit=1';
	got(url, function(err, data, res) {
	    if (err) { callback(err); return; }
	    last_key = Object.keys(JSON.parse(data))[0];
	    callback(null, last_key);
	})	

    } else {
	// get next package
	var url = crandb + '/-/desc?limit=2&startkey="' + last_key + '"';
	got(url, function(err, data, res) {
	    if (err) { callback(err); return; }
	    last_key = Object.keys(JSON.parse(data))[1];
	    callback(null, last_key);
	})
    }
}

function update_stars(package, repo) {
    gh_got('repos/' + repo, { token: gh_token }, function(err, data) {
	if (err) {
	    console.log("Failed to update ", package, " ", repo);
	    return;
	}
	var no_stars = data.stargazers_count;
	var doc = { 'date': new Date().toISOString(),
		    'stars': no_stars };

	db.update = function(obj, key, callback) {
	    var db = this;
            db.get(key, function (error, existing) {
		if(!error) obj._rev = existing._rev;
		db.insert(obj, key, callback);
            });
	}
	
	db.update(doc, package, function(error, response) {
            if (error) { console.log(error); return; }
	});

    })
}

module.exports = job;
