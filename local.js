
var pfs = require('pull-fs')
var fs = require('fs')
var semver = require('semver')
var pull = require('pull-stream')

module.exports = function () {

  var cache = {}

  function memoize (fn) {
    cache[fn.name] = {}
    return function (arg, cb) {
      if(cache[fn.name][arg]) return cb.apply(null, cache[fn.name][arg])
      else
        fn(arg, function (err, value) {
          cache[fn.name][arg] = [err, value]
          cb(err, value)
        })
    }
  }

  var stat = memoize(function stat (filename, cb) {
    fs.stat(filename, function (err, stat) {
      if(err) return cb()
      stat.filename = filename
      cb(null, stat)
    })
  })

  var json = memoize(function json (filename, cb) {
    fs.readFile(filename, 'utf8', function (err, data) {
      if(err) return cb(err)
      try {
        data = JSON.parse(data)
      } catch (err) {
        return cb(err)
      }
      cb(null, data)
    })

  })

  var ls = memoize(function ls (dirname, cb) {
    fs.readdir(dirname, function (err, files) {
      if(err) cb(err)
      else    cb(null, files
        .map(function (e) { return path.resolve(dirname, e) })
      )
    })

  })

  function exists () {
    return pull(
      pull.asyncMap(stat),
      pull.filter(),
      pull.map(function (e) {
        return e.filename
      })
    )
  }

  return function (module, config, cb) {
    if(config.local === false) return cb()
    return pull(
      pfs.ancestors(config.path),
      pfs.resolve('node_modules'),
      exists(),
      pfs.resolve(module + '/package.json'),
      pull.asyncMap(json),
      pull.find(null, cb)
    )
  }

}

