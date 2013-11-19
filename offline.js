var semver = require('semver')
var fs = require('fs')
var path = require('path')
var tar = require('tar')
var zlib = require('zlib')

function readJson(file, cb) {
  fs.readFile(file, 'utf-8', function (err, json) {
    if(err) return cb(err)
    try { json = JSON.parse(json) } catch (err) { return cb(err) }
    cb(null, json)
  })
}

function untar(file, dir, cb) {
  fs.createReadStream(file)
  .pipe(zlib.createGunzip())
  .on('error', function (err) {
    err.message = (
        err.message
      + '\n trying to unpack '
      + name + '@' + ver
    )
    cb(err)
  })
  .pipe(tar.Extract({path: dir}))
  .on('end', cb)
}

module.exports = function (module, vrange, opts, cb) {

  var cache = opts.cache || path.join(process.env.HOME, '.npm')
  fs.readdir(path.join(cache, module), function (err, list) {
    if(err) return cb(err)
    list = list.filter(function (e) {
      return semver.valid(e, true)
    })
    var ver = semver.maxSatisfying(list, vrange, true)
    if(!ver)
      return cb(new Error('no module satified version:' + vrange))
      var cachedir = path.join(cache, module, ver)
      var pkgfile =  path.join(cachedir,'package', 'package.json')
      readJson(pkgfile, function (err, pkg) {
        if(err && err.code == 'ENOENT') {
          //maybe we have been installing things with npmd?
          //if so, the package.json won't be unpacked.
          //unpack it and try again.
          return untar(
            path.join(cachedir, 'package.tgz'),
            cachedir,
            function (err, pkg) {
              if(err) return cb(err)
              readJson(pkgfile, function (err, pkg) {
                pkg.shasum = pkg.shasum || pkg.dist ? pkg.dist.shasum : undefined
              })
            })
        }
        cb(err, pkg)
      })
  })
}

