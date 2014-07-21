
var semver = require('semver')
var pull = require('pull-stream')

function isHash(h) {
  return /^[0-9a-f]{40}$/.test(h)
}

// given a document from the registry,
// pick a version.

function errstream (err) {
  return function (_, cb) { cb(err) }
}

module.exports = function (doc, vrange, opts, cb) {

  // if the version is a tag,
  // set the version to the tagged version
  if(doc['dist-tags'] && doc['dist-tags'][vrange])
    vrange = doc['dist-tags'][vrange]

  // ********************
  // If there was no satisfying version,
  // and we didn't actually *fetch* anything
  // maybe it's only just been published.
  // So, it might be a good idea to fetch that again
  // enabled by --refetch ?
  // need to test how often I actually run into this problem.
  // ********************

  // ********************
  // filter modules by max publish timestamp
  // this allows you to resolve a module as it would have resolved
  // at a given point backwards in time.
  // the intended use of this is mainly to make it possible to test
  // npmd-resolve and have the output be deterministic.
  // ********************

  var versions =
    Object.keys(doc.versions)
    .sort(semver.compareLoose)
    .reverse()
    .map(function (v) { return doc.versions[v] })

  if(opts.maxTimestamp)
    versions = versions.filter(function (pkg) {
      return doc.time[v.version] < opts.maxTimestamp
    })

  function choose(pkgs) {
    pkgs.forEach(function (pkg) {
      pkg.shasum = pkg.shasum || pkg.dist.shasum
      pkg.tarball = pkg.dist.tarball
    })
    return pull.values(pkgs)
  }

  function reject(reason) {
    return errstream(new Error(reason))
  }

  if(isHash(vrange)) {
    for(var i in versions) {
      var pkg = versions[i]
      if(pkg.dist.shasum == vrange)
        return choose([pkg])
    }
    return reject('cannot resolve hash:' + vrange)
  }

  versions = versions.filter(function (pkg) {
    return semver.satisfies(pkg.version, vrange, true)
  })

  if(!versions.length)
    return reject('no version satisfying:' +
        JSON.stringify(vrange) +
        ' expected one of ' + JSON.stringify(versions)
      )
  else
    return choose(versions)
}
