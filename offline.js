'use strict';
var semver = require('semver')
var fs = require('fs')
var path = require('path')
var pull = require('pull-stream')
var chooser = require('./choose-from-registry')

function readJson(file, cb) {
  fs.readFile(file, 'utf-8', function (err, json) {
    if(err) return cb(err)
    try { json = JSON.parse(json) } catch (err) { return cb(err) }
    cb(null, json)
  })
}

module.exports = function (module, vrange, opts, cb) {
  if(/\//.test(vrange))
    return cb()

  var cache = opts.cache || path.join(process.env.HOME, '.npm')

  readJson(path.join(cache, module, '.cache.json'), function (err, doc) {
    if(err) return cb()

    if(!doc.versions)
      return cb(new Error('package document invalid'))

    pull(
      chooser(doc, vrange, opts),
      pull.asyncMap(function (pkg, cb) {

        var filename = path.join(
                        opts.dbPath, 'blobs',
                        pkg.shasum.substring(0, 2),
                        pkg.shasum.substring(2)
                      )
        fs.stat(filename, function (err, stat) {
          if(err) cb()
          else    cb(null, pkg)
        })

      }),
      pull.find(Boolean, function (err, pkg) {
        if(err) cb(err)
        else if(pkg) cb(null, pkg)
        else
          cb(new Error('not found: ' + module + '@' + vrange
            + ( opts.maxTimestamp
              ? '\n  (published before: ' + opts.maxTimestamp + ')'
              : '')
          ))
      })
    )
//
//    pull(
//      pull.values(versions),
//      pull.asyncMap(function (version, cb) {
//        var hash = json.versions[version].dist.shasum
//
//        var pkg = json.versions[version]
//        pkg.shasum = pkg.dist.shasum
//        pkg.tarball = pkg.dist.tarball
//
//        var filename = path.join(
//                        opts.dbPath, 'blobs',
//                        hash.substring(0, 2),
//                        hash.substring(2)
//                      )
//
//        fs.stat(filename, function (err, stat) {
//          if(err) cb()
//          else    cb(null, pkg)
//        })
//
//      }),
//      pull.filter(function (pkg) {
//        if(!pkg) return
//        return semver.satisfies(pkg.version, vrange)
//      }),
//      pull.take(function (item) {
//        found = true
//        cb(null, item)
//        return false
//      }),
//      pull.drain(null, function (err) {
//        if(!found)
//          cb(new Error('not found: ' + module + '@' + vrange
//            + ( opts.maxTimestamp
//              ? '\n  (published before: ' + opts.maxTimestamp + ')'
//              : '')
//          ))
//
//      })
//    )
//
  })
}

