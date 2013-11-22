var semver = require('semver')
var fs = require('fs')
var path = require('path')
var tar = require('tar')
var zlib = require('zlib')
var crypto = require('crypto')

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
      + file
    )
    cb(err)
  })
  .pipe(tar.Extract({path: dir}))
  .on('end', cb)
}

function sha(file, cb) {
  var hash = crypto.createHash('sha1')
  fs.createReadStream(file)
  .on('data', function (d) { hash.update(d) })
  .on('end', function () { cb(null, hash.digest('hex')) })
  .on('error', cb)
}

function readJsonAndHash (cachedir, cb) {
  var err, hash, pkg
  sha(path.join(cachedir, 'package.tgz'), function (_err, _hash) { 
    err =_err; hash = _hash; next()
  })
  readJson(path.join(cachedir, 'package', 'package.json'), function (_err, _pkg) {
    err = _err; pkg = _pkg; next()
  })

  function next () {
    if(err) return cb(err)
    if(hash && pkg) {
      pkg.shasum = hash
      cb(err, pkg)
    }
  }

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
    readJsonAndHash(cachedir, function (err, pkg) {
      if(err && err.code == 'ENOENT') {
        //maybe we have been installing things with npmd?
        //if so, the package.json won't be unpacked.
        //unpack it and try again.
        return untar(
          path.join(cachedir, 'package.tgz'),
          cachedir,
          function (err, pkg) {
            if(err) return cb(err)
            readJsonAndHash(cachedir, cb)
          })
      }
      cb(null, pkg)
    })

  })
}

