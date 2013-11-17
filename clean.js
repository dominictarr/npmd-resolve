var fields = ['name', 'version', 'from', 'gypfile', 'shasum']

module.exports = function clean (pkg) {
  var deps = pkg.dependencies
  var _deps = pkg.tree || {}

  for(var k in pkg)
    if(!~fields.indexOf(k))
      delete pkg[k]

  for(var k in _deps) {
    _deps[k].from = deps[k]
    clean(_deps[k])
  }

  pkg.dependencies = _deps

  return pkg
}

