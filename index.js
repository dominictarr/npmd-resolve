var path    = require('path')
var ls       = require('npmd-tree').ls

var createResolvePackage = require('./resolve')
var createResolve        = require('./resolve-tree')

exports.db = function (db, config) {
  var resolvePackage = createResolvePackage(db.sublevel('ver'), config)
  var resolve = createResolve(resolvePackage)
  db.methods.resolve = {type: 'async'}
  db.resolve = function (module, opts, cb) {
    if(!cb) cb = opts, opts = {}
    if(opts.hash) opts.greedy = false
    resolve(
      module,
      opts,
      cb
    )
  }
}

function merge (a, b) {
  for(var k in b)
    if(!a[k])
      a[k] = b[k]
  return a
}

exports.cli = function (db) {
  db.commands.push(function (db, config, cb) {
    var args = config._.slice()
    var cmd = args.shift()
    
    if(cmd === 'resolve') {
      if(!args.length)
        args = deps(process.cwd(), config)

      ls(function (err, tree) {
        if(err) return cb(err)
        db.resolve(args,
          merge({
            greedy: config.greedy,
            available: tree
          }, config),
          function (err, tree) {
            if(err) return cb(err)
            console.log(JSON.stringify(tree, null, 2))
            cb(null, tree)
        })
      })
      return true
    }

  })
}

