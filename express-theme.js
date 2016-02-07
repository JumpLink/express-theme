"use strict";
var express = require('express');
var fs = require('fs-extra');
var async = require('async');
var path = require('path');
var _ = require('lodash');
var debugModule = require('debug');
var debug = debugModule("theme");
var THEME_PACKAGE_FILENAME = "bower.json";
var THEME_ASSETS_DIRNAME = "assets";
var Theme = (function () {
    function Theme(options) {
        var _this = this;
        this.options = options;
        this._router = express.Router();
        // get infos for theme(s)
        this._router.use(function (req, res, next) {
            var themesPath = path.join(req.app.get('views'), _this._options.themes);
            _this.getThemes(themesPath, function (err, themes) {
                debug("themes", themes);
            });
            var themeName = _this._options.theme;
            var themePath = path.join(req.app.get('views'), _this._options.themes, themeName);
            var themePackagePath = path.join(themePath, THEME_PACKAGE_FILENAME);
            var themeAssetsPath = path.join(themePath, THEME_ASSETS_DIRNAME);
            fs.readJson(themePackagePath, function (err, themePackage) {
                if (err && err !== null) {
                    debug(err);
                    return next(err);
                }
                var theme = {
                    name: themeName,
                    path: themePath,
                    packagePath: themePackagePath,
                    package: themePackage,
                    assetsPath: themeAssetsPath,
                };
                req['theme'] = theme;
                debug(req['theme']);
                next();
            });
        });
        // set public path in theme
        this._router.use(function (req, res, next) {
            _this._router.use(express.static(req.theme.assetsPath));
            next();
        });
        // render view in theme
        this._router.use(function (req, res, next) {
            debug(req.path);
            var renderFilePath = path.join(req.theme.path, req.path + '.jade');
            fs.stat(renderFilePath, function (err, stat) {
                if (err && err !== null) {
                    debug(err);
                    return next();
                }
                if (stat.isFile()) {
                    return res.render(renderFilePath, { title: 'Express' });
                }
                next();
            });
        });
        this._router.get('/', function (req, res, next) {
            res.render(path.join(req['theme'].path, 'index'), { title: 'Express' });
        });
    }
    Object.defineProperty(Theme.prototype, "options", {
        set: function (options) {
            this._options = options;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Theme.prototype, "router", {
        get: function () {
            return this._router;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Get all valid themes from theme path
     */
    Theme.prototype.getThemes = function (themesPath, callback) {
        var _this = this;
        this.getDirs(themesPath, function (error, dirs) {
            if (error) {
                debug("error", error);
                return callback(error);
            }
            debug("getThemes dirs", dirs);
            async.filter(dirs, function (dir, callback) {
                _this.getThemePackage(path.join(themesPath, dir), function (err, packageObj) {
                    if (err && err !== null) {
                        debug("error", err);
                        return callback(false);
                    }
                    return callback(true);
                });
            }, function (results) {
                callback(null, results);
            });
        });
    };
    /**
     * Get theme packageObj of theme dir
     */
    Theme.prototype.getThemePackage = function (dir, callback) {
        var packagePath = path.join(dir, THEME_PACKAGE_FILENAME);
        fs.stat(packagePath, function (err, stat) {
            if (err && err !== null) {
                debug("error", err);
                return callback(err);
            }
            if (!stat.isFile()) {
                return callback(new Error(packagePath + " is not a file!"));
            }
            fs.readJson(packagePath, function (err, packageObj) {
                if (err && err !== null) {
                    debug("error", err);
                    return callback(err);
                }
                if (!_.isString(packageObj.version) || !_.isString(packageObj.name)) {
                    return callback(new Error("theme package file broken!"));
                }
                callback(null, packageObj);
            });
        });
    };
    /**
     * Get all directories within directory
     * @see http://stackoverflow.com/a/18112359/1465919
     */
    Theme.prototype.getDirs = function (rootDir, cb) {
        debug(rootDir);
        fs.readdir(rootDir, function (err, files) {
            var dirs = [];
            if (err && err !== null) {
                debug("error", err);
                return cb(err);
            }
            async.map(files, function (file, callback) {
                if (file[0] === '.') {
                    return callback(null, null);
                }
                var filePath = rootDir + '/' + file;
                fs.stat(filePath, function (err, stat) {
                    if (err && err !== null) {
                        return cb(err);
                    }
                    if (stat.isDirectory()) {
                        return callback(null, file);
                    }
                    return callback(null, null);
                });
            }, function (err, results) {
                if (err && err !== null) {
                    return cb(err);
                }
                async.filter(results, function (file, callback) {
                    callback(file !== null);
                }, function (results) {
                    cb(err, results);
                });
            });
        });
    };
    return Theme;
}());
exports.Theme = Theme;
