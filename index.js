#! /usr/bin/env node

var createResolvePackage = require('./resolve')
var createResolve        = require('./resolve-tree')

module.exports = function (db, cache, config) {
  return createResolve(createResolvePackage(cache, config))
}

if(!module.parent) {
  var config = require('npmd-config')
  var args = config._
//  var resolvePackage = createResolvePackage(require('npmd-cache')(config), config)
  var resolvePackage = createResolvePackage({resolve: function (m,v,o,cb) { cb() }}, config)
  var resolve = createResolve(resolvePackage)
  var getDeps = require('get-deps')
  if(config.version) {
    console.log(require('./package').version)
    process.exit()
  }

  var data = ''
  if(!process.stdin.isTTY)
    process.stdin
      .on('data', function (d) { data += d })
      .on('end', function () {
        resolve(JSON.parse(data), config, function (err, tree) {
          if(err) throw err
          console.log(JSON.stringify(tree, null, 2))
        })

      })
  else {
    if(!args.length)
      args = getDeps(process.cwd(), {dev: true})
    resolve(args, config, function (err, tree) {
      if(err) throw err
      console.log(JSON.stringify(tree, null, 2))
    })
  }
}
