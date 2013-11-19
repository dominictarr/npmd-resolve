var request = require('request')
var fs = require('fs')
var path = require('path')
var url = require('url')
var semver = require('semver')
var mkdirp = require('mkdirp')

function readJson(file, cb) {
  fs.readFile(file, 'utf-8', function (err, json) {
    if(err) return cb(err)
    try { json = JSON.parse(json) } catch (err) { return cb(err) }
    cb(null, json)
  })
}

module.exports = function (module, vrange, opts, cb) {
  var headers = {}
  var registry = opts.registry || 'http://registry.npmjs.org'
  var cache = opts.cache || path.join(process.env.HOME, '.npm')
  var u = url.resolve(registry, module)
  var cachedfile = path.join(cache, module, '.cache.json')
  console.error('GET', u)
  readJson(cachedfile, function (err, json) {
    if(!err)
      headers['if-none-match'] = json._etag
    request({url: u, headers: headers}, function (err, res, data) {
      console.error(res.statusCode, u)
      if(err) return cb(err)
      if(res.statusCode === 304)
        return next(null, json)

      try { data = JSON.parse(data.toString('utf-8')) } catch (err) { return cb(err) }
      data._etag = res.headers.etag
      mkdirp(path.join(cache, module), function (err) {
        if(err) return cb(err)
        fs.writeFile(cachedfile, JSON.stringify(data), function (err) {
          //put this into leveldb, if possible!
          if('function' === typeof opts.onRegistry)
             opts.onPullFromRegistry(data)
          next(err, data)
        })
      })
      function next (err, json) {
        if(err) return cb(err)
        var versions = Object.keys(json.versions)
        var ver = semver.maxSatisfying(versions, vrange, true)
        if(!ver)
          return cb(new Error('no version satisfying:' +
            JSON.stringify(vrange) +
            ' expected one of ' + JSON.stringify(versions)
          ))
        var pkg = json.versions[ver]
        pkg.shasum = pkg.shasum || pkg.dist.shasum
        cb(null, pkg)
      }
    })
  })
}
