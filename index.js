#! /usr/bin/env node

var createResolvePackage = require('./resolve')
var createResolve        = require('./resolve-tree')

module.exports = function (db, config) {
  return createResolve(createResolvePackage(db, config))
}

if(!module.parent) {
  var resolvePackage = createResolvePackage(null, {})
  var resolve = createResolve(resolvePackage)
  resolve(process.argv.slice(2), {}, function (err, tree) {
    if(err) throw err
    console.log(JSON.stringify(tree, null, 2))
  })
}
