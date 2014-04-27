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

var seen = {}

module.exports = function (module, vrange, opts, cb) {

  if(!semver.validRange(vrange))
    return cb()

  var cache = opts.cache || path.join(process.env.HOME, '.npm')

  readJson(path.join(cache, module, '.cache.json'), function (err, doc) {
    if(err) return cb()

    pull(
      pull.values(Object.keys(doc.versions).sort(function (a, b) {
        return semver.compareLoose(a, b) * -1
      })),
      pull.asyncMap(function (version, cb) {
        var hash = doc.versions[version].dist.shasum

//        var filename = path.join(opts.dbPath, 'blobs', hash.substring(0, 2), hash.substring(2))
//        fs.stat(filename, function (err, stat) {
//          if(err) cb()
//          else    cb(null, doc.versions[version])
//        })

        var dirname = path.join(opts.dbPath, 'blobs', hash.substring(0, 2))
        if(seen[hash]) return cb(null, doc.versions[version])
        fs.readdir(dirname, function (err, ls) {
          if(err) return cb()
          ls.forEach(function (hash) {
            seen[hash] = true
          })
          cb(null, seen[hash] ? doc.versions[version] : null)
        })

      }),
      pull.filter(),
      pull.take(1),
      pull.collect(function (err, ary) {
        if(err) return cb(err)
        cb(null, ary[1])
      })
    )
  })
}

