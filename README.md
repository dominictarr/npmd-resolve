# npmd-resolve

npmd dependency tree resolution.

given an [npmd](https://github.com/dominictarr/npmd)
database full of npm package.jsons,
resolve the dependency tree for a module & version.

If a leveldb is not provided, npmd-resolve will resolve by looking in your `~/.npm/`
cache, or querying the npm registry, if you provide the `{online: true}` option.

## example

``` js
var createResolver = require('npmd-resolve')
var config = require('npmd-config')

//this is the signature that npmd plugins take.
//npmd-resolve doesn't actually use the db (currently)
//so that can be null. It must use the cache, though.

var resolve = createResolver(db=null, require('npmd-cache')(config), config)

resolve('browserify@3', {greedy: true}, function (err, tree) {
  console.log(JSON.stringify(tree, null, 2))
})
```

## UNIX

``` bash
npm install -g npmd-resolve npmd-install
# then
npmd-resolve browserify | npmd-install
# or
npmd-resolve browserify --online | npmd-install
```

## Usage

``` bash
npmd-resolve module@ver,...   # resolve specific modules
npmd-resolve < package.json   # resolve all deps for this package.json
npmd-resolve                  # resolve all deps for current directory

# options

  --greedy                    # make tree as flat as possible.
  --maxTimestamp ISO_TIME     # only resolve modules publish before ISO_TIME
  --override module@version:new_version
                              # always resolve instances of {module} that would accept
                              # {version} with {new_version} instead. useful for testing.
```
## greedy mode

If `{greedy: true}` is enabled,
resolve will build a dependency tree that is as flat as possible, this will remove a lot of duplication.
It's not optimal, but is still much less duplicaty than a default npm install.



## maxTimestamp

If `{maxTimestamp: isoDateString}` is provided, npmd-resolve will ignore modules published after that time.
This is only possible for modules in the registry, but assuming that npm's clock only goes forward,
and that module refered to by a url do not mutate (best practice: include commit hash in git urls)
then this option should allow you to resolve deterministic dependency trees.



## resolve strategies

`npmd-resolve` has a number of resolve strategies, and if an early one cannot resolve something,
it'll fallback to the next one.

### override resolve

First, check whether an override for this module has been provided. This allows you to resolve a tree,
but inject a different version of a particular dependency. This is particularily useful for testing.
see [below](#override) for override options.

### online resolve

Resolve by reading cached registry docs, (from `.npm/{module_name}/.cache.json`, this is the same as npm)
If they are a older than a day (default) then refetch those docs. If the `--freshen` option is passed
all docs will be requested from the registry and the cache will be updated.
online resolve will pick the latest version, even if it's not in the cache, because it will be able
to download latest package version from the registry.

### offline resolve

Resolve by reading cached registry docs, the same as online resolve, but never re-request them.
Also, pick the latest available package that is saved in the cache, because we will not be able to install a new one.

### cache resolve

Resolve modules that where not saved in the registry (i.e, based on a http or git url).
See [npmd-cache](https://github.com/dominictarr/npmd-cache) when these modules are requested,
the tarball is saved in a [content addressable store](https://github.com/dominictarr/content-addressable-store)
and a record that that URL -> that hash is saved in a database. To resolve, get that url,
then pull the package.json out of the tarball it points to. If we are in online mode and the cache is old,
it will be requested again.

## override

Suppose I have written a popular module, `foo`, and I want to test it does not break any dependant modules.
I can then install another module 'blerg`, that uses `foo`, except with inject a new version of `foo`
_that I havn't published yet_, run the tests, and check whether I havn't broken anything,
now I know it's safe to publish as a patch.

### --override option

resolve a module, but replace a dependency with a new target version.
if a `version` is provided to the override, then only modules that would accept that version
will be overridden. For example, suppose I want to check that my patch version of through is non-breaking.
First, I'd package a new version of my module, and add it to the cache. I can now resolve it by the hash of the tarball.

``` bash
npmd-resolve {module}@{version_range} --override {module2}[@{version}]:{target}
```

Or, if calling npmd-resolve within node, I can just pass in the `package.json` of the new tarball.

``` js
foo_package.shasum = shasum(foo_tarball)
resolve('bar@*', {override: {foo: foo_package}}, function (err, tree) {
  ...
})
```



## License

MIT

