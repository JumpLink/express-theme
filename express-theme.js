"use strict";
var express = require('express');
var fs = require('fs-extra');
var async = require('async');
var path = require('path');
var _ = require('lodash');
var debugModule = require('debug');
var debug = debugModule("theme");
var THEME_PACKAGE_FILENAME = "package.json";
var Theme = (function () {
    function Theme(options) {
        this.options = options;
        this._router = express.Router();
        this.getThemes(function (err, themes) {
            debug("themes", themes);
        });
        this._router.use(function (req, res, next) {
            debug('Time:', Date.now());
            next();
        });
        this._router.get('/', function (req, res, next) {
            res.render('index', { title: 'Express' });
        });
        /* GET users listing. */
        this._router.get('/users', function (req, res, next) {
            res.send('respond with a resource');
        });
    }
    Object.defineProperty(Theme.prototype, "options", {
        set: function (options) {
            this._options = options;
            this._options.themesPath = path.join(this._options.views, this._options.themes);
            this._options.themePath = path.join(this._options.themesPath, this._options.theme);
            this._options.themePackagePath = path.join(this._options.themePath, THEME_PACKAGE_FILENAME);
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
    Theme.prototype.getThemes = function (callback) {
        var _this = this;
        this.getDirs(this._options.themesPath, function (error, dirs) {
            if (error) {
                debug("error", error);
                return callback(error);
            }
            debug("getThemes dirs", dirs);
            async.filter(dirs, function (dir, callback) {
                _this.getThemePackage(path.join(_this._options.themesPath, dir), function (err, packageObj) {
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
