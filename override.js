
var semver = require('semver')

/*

if opts.override is non null, then resolve modules that match from there.

{
  //either pass in the package.json you want for that package.
  foo: foo_package_json

  //or pass in another valid range...
  bar: {verison: '1.0.1', to: '~2.0.0'}
  //this will replace any bar that can use 1.0.1 with something that matches ~2.0.0
}

*/

function isPackage(pkg) {
  return pkg.name && pkg.version && (pkg.dependencies || pkg.devDependencies)
}


module.exports = function (fallback) {

  return function (module, vrange, opts, cb) {
    if('string' === typeof opts.override) {
      var or = {}
      opts.override.split(',').map(function (e) {
        var parts = e.split(/@|:/)
        var module = parts.shift()
        var to = parts.pop()
        var version = parts.shift()
        or[module] = {version: version || '*', target: to}
      })
      opts.override = or
    }

    //falback if there is no override for this module.
    if(!opts.override || !opts.override[module])
      return fallback(module, vrange, opts, cb)

    //check if we can resolve this module with our override.

    var r = opts.override[module]

    if(semver.validRange(vrange) && semver.satisfies(r.version, vrange)) {
      //if the entire package.json was passed in...
      //that is all that we need to resolve this.
      if(isPackage(r)) {
        r.shasum = r.shasum || (r.dist && r.dist.shasum)
        return cb(null, r)
      }
      else {
        fallback(r.name || module, r.target, opts, function (err, pkg) {
          if(!err) return cb(null, pkg)

          err.message = 'Override failed. could not replace '
            + module + '@' + r.version
            + ' => ' + (r.name ? r.name + '@' : '') + r.target
            + '\n'
            + err.message

          cb(err)
        })
      }
    }

  }
}
