#! /usr/bin/env node

var createResolvePackage = require('./resolve')
var createResolve        = require('./resolve-tree')

module.exports = function (db, config) {
  return createResolve(createResolvePackage(db, config))
}

if(!module.parent) {
  var resolvePackage = createResolvePackage(null, {})
  var resolve = createResolve(resolvePackage)
  var opts = {}
  var args = process.argv.slice(2).filter(function (e) {
    if(/^--online/.test(e)) return !(opts.online = true)
    if(/^--greedy/.test(e)) return !(opts.greedy = true)
    return true
  })

  resolve(args, opts, function (err, tree) {
    if(err) throw err
    console.log(JSON.stringify(tree, null, 2))
  })
}
