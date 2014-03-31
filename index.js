#! /usr/bin/env node

var createResolvePackage = require('./resolve')
var createResolve        = require('./resolve-tree')

module.exports = function (db, cache, config) {
  return createResolve(createResolvePackage(cache, config))
}

if(!module.parent) {
  var resolvePackage = createResolvePackage(null, {})
  var resolve = createResolve(resolvePackage)
  var getDeps = require('get-deps')
  var config = require('npmd-config')
  var args = config._
  if(config.version) {
    console.log(require('./package').version)
    process.exit()
  }

  var data = ''
  if(!process.stdin.isTTY)
    process.stdin
      .on('data', function (d) { data += d })
      .on('end', function () {
        args = getDeps.mergeDeps(JSON.stringify(data), {dev: true})
        next()
      })
  else
    next()

  function next () {
    if(!args.length)
      args = getDeps(process.cwd(), {dev: true})
    resolve(args, config, function (err, tree) {
      if(err) throw err
      console.log(JSON.stringify(tree, null, 2))
    })

  }
}
