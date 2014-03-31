var request = require('request')
var fs = require('fs')
var path = require('path')
var url = require('url')
var semver = require('semver')
var mkdirp = require('mkdirp')

function readJson(file, cb) {
  fs.stat(file, function (err, stat) {
    if(err) return cb(err)
    fs.readFile(file, 'utf-8', function (err, json) {
      if(err) return cb(err)
      try { json = JSON.parse(json) } catch (err) { return cb(err) }
      cb(null, json, stat)
    })
  })
}

var MIN = 60*1000
var HOUR = 60*MIN
var DAY = 24*HOUR

module.exports = function (module, vrange, opts, cb) {
  var headers = {}
  var registry = opts.registry || 'https://registry.npmjs.org'
  var cache = opts.cache || path.join(process.env.HOME, '.npm')
  var u = url.resolve(registry, module)
  var cachedfile = path.join(cache, module, '.cache.json')

  //only resolve module@semver (NOT urls - leave that to npmd-cache)

  if(!semver.validRange(vrange))
    return cb()

  var nowish = new Date()
  var fetched = false
  //stat & read the json file.
  readJson(cachedfile, function (err, json, stat) {
    if(!err)
      headers['if-none-match'] = json._etag

    if(json) {
      //if the file is very new,

      if(+stat.mtime > nowish - (opts.minAge || 10*MIN))
        return next(null, json)

      //if the file is not old, carry on and use it.
      if(!opts.freshen && +stat.mtime > nowish - (opts.maxAge || DAY))
        return next(null, json)

    }

    function fetch () {
      fetched = true
      request({url: u, headers: headers}, function (err, res, data) {
        if(err) return cb(err)
        console.error(''+res.statusCode, u)
        //if the file was still current - update mtime, so will hit cache next time.
        if(res.statusCode === 304)
          return fs.utimes(cachedfile, nowish, nowish, function () {
            next(null, json)
          })

        try { data = JSON.parse(data.toString('utf-8')) } catch (err) { return cb(err) }
        data._etag = res.headers.etag

        //save the newly downloaded doc.
        mkdirp(path.join(cache, module), function (err) {
          if(err) return cb(err)
          fs.writeFile(cachedfile, JSON.stringify(data), function (err) {
            //put this into leveldb, if possible!
            if('function' === typeof opts.onRegistry)
               opts.onRegistry(data)
            next(err, data)
          })
        })
      })
    }

    function next (err, json) {
      if(err) return cb(verError || err)

      // ********************
      // If there was no satisfying version,
      // and we didn't actually *fetch* anything
      // maybe it's only just been published.
      // So, it might be a good idea to fetch that again
      // enabled by --refetch
      // need to test how often I actually run into this problem.
      // ********************

      var versions = Object.keys(json.versions)
      var ver = semver.maxSatisfying(versions, vrange, true)
      if(!ver) {
        if(!fetched && opts.refetch) return fetch()
        return cb(new Error('no version satisfying:' +
          JSON.stringify(vrange) +
          ' expected one of ' + JSON.stringify(versions)
        ))
      }
      var pkg = json.versions[ver]
      pkg.shasum = pkg.shasum || pkg.dist.shasum
      
      // ********************
      // There are some modules (at least esprima-fb@3001.1.0-dev-harmony-fb)
      // where the url does not match the version. it's probably only in cases
      // where the semver is invalid. I'm gonna include this ugly work-around.
      // because fixing it in the database is out of my control...

      var from = (
        registry + '/' + pkg.name + '/-/' + 
        pkg.name + '-' + pkg.version + '.tgz'
      ).replace(/^https/, 'http')
      if(pkg.dist.tarball.replace(/^https/, 'http') !== from)
        pkg.from = pkg.dist.tarball.replace(/^http:/, 'https:')

      //*********************
      
      cb(null, pkg)
    }

    // if the cache was too old, or missing,
    // request doc from registry.
    console.error('GET', u)
    fetch()
  })
}

if(!module.parent) {
  var opts = require('minimist')(process.argv.slice(2))
  var parts = opts._[0].split('@')
  var name = parts.shift()
  var range = parts.shift() || '*'
  module.exports(name, range, opts, function (err, pkg) {
    console.log(JSON.stringify(pkg, null, 2))
  })
}
