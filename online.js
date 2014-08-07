'use strict';
var request = require('request')
var fs = require('fs')
var path = require('path')
var url = require('url')
var semver = require('semver')
var mkdirp = require('mkdirp')
var npmUrl = require('npmd-url')
var pull   = require('pull-stream')

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

var chooser = require('./choose-from-registry')

var MIN  = 60*1000
var HOUR = 60*MIN
var DAY  = 24*HOUR

module.exports = function (module, vrange, opts, cb) {
  var headers = {}
  var auth
  var registry = opts.registry || 'https://registry.npmjs.org'
  var cache = opts.cache || path.join(process.env.HOME, '.npm')

  //only resolve module@semver (NOT urls - leave that to npmd-cache)

  //it's a url/other protocol
  if(/\//.test(vrange)) return cb()

  var u = url.resolve(registry, module)
  var cachedfile = path.join(cache, module, '.cache.json')

  if (opts['always-auth']) {
    var creds = Buffer(opts['_auth'], 'base64').toString()
    var segs = creds.split(':')
    auth = { user: segs[0], pass: segs[1] }
  }

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
      request({
        url: u, headers: headers, auth: auth
      }, function (err, res, data) {

        if(err) return cb(err)
        console.error(''+res.statusCode, u)
        //if the file was still current - update mtime, so will hit cache next time.

        if(res.statusCode === 304)
          return fs.utimes(cachedfile, nowish, nowish, function () {
            next(null, json)
          })

        if(res.statusCode >= 400) {
          return cb(new Error(res.statusCode + ' when requesting:' + module + '@' + vrange))
        }

        try { data = JSON.parse(data.toString('utf-8')) } catch (err) { return cb(err) }
        data._etag = res.headers.etag

        if(!data.versions)
          return cb(new Error('package document invalid'))

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

    function next (err, doc) {
      if(err) return cb(err)
      //read a singe value from the stream.
      pull(
        chooser(doc, vrange, opts),
        pull.find(Boolean, cb)
      )
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
