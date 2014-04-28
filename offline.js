var semver = require('semver')
var fs = require('fs')
var path = require('path')
var pull = require('pull-stream')

function readJson(file, cb) {
  fs.readFile(file, 'utf-8', function (err, json) {
    if(err) return cb(err)
    try { json = JSON.parse(json) } catch (err) { return cb(err) }
    cb(null, json)
  })
}

module.exports = function (module, vrange, opts, cb) {
  if(!semver.validRange(vrange))
    return cb()

  var cache = opts.cache || path.join(process.env.HOME, '.npm')

  readJson(path.join(cache, module, '.cache.json'), function (err, doc) {
    if(err) return cb()
    var found = false
    pull(
      pull.values(
        Object.keys(doc.versions)
        .sort(semver.compareLoose)
        .reverse()
      ),
      pull.asyncMap(function (version, cb) {
        var hash = doc.versions[version].dist.shasum

        var pkg = doc.versions[version]
        pkg.shasum = pkg.dist.shasum

        var filename = path.join(
                        opts.dbPath, 'blobs',
                        hash.substring(0, 2),
                        hash.substring(2)
                      )

        fs.stat(filename, function (err, stat) {
          if(err) cb()
          else    cb(null, pkg)
        })

      }),
      pull.filter(function (pkg) {
        if(!pkg) return
        return semver.satisfies(pkg.version, vrange)
      }),
      pull.take(function (item) {
        found = true
        cb(null, item)
        return false
      }),
      pull.drain(null, function (err) {
        if(!found)
          cb(new Error('not found: ' + module + '@' + vrange))
      })
    )
  })
}

