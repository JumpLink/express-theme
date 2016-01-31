import * as express from 'express';
import * as fs from 'fs-extra';
import * as async from 'async';
import * as path from 'path';
import * as _ from 'lodash';
import * as debugModule from 'debug';
var debug = debugModule("theme");

const THEME_PACKAGE_FILENAME = "package.json";

export interface ThemeOptions {
	/**
	 * path of view files to render
	 */
	views: string;
	/**
	 * view engine, e.g. jade
	 */
	viewEngine: string;
	/**
	 * environment, development or production
	 */
	env: string;
	/**
	 * themes folder name
	 */
	themes: string;
	/**
	 * current theme name
	 */
	theme: string;
	/**
	 * path of themes
	 */
	themesPath?: string;
	/**
	 * path of current theme
	 */
	themePath?: string;
	/**
	 * path of package file of current theme 
	 */
	themePackagePath?: string;
}

interface themePackage {
	name: string;
	description?: string;
	version: string;
}

interface themePackageCallback {
	(
		error?: Error,
		packageObj?: themePackage
	): any
}

interface getDirsCallback {
	(
		error?: Error,
		dirs?: string[]
	): any
}

interface booleanCallback {
	(
		error?: Error,
		result?: boolean
	): any
}

export class Theme {
	private _router: express.Router;
	private _options: ThemeOptions;

	set options(options: ThemeOptions) {
		this._options = options;
		this._options.themesPath = path.join(this._options.views, this._options.themes);
		this._options.themePath = path.join(this._options.themesPath, this._options.theme);
		this._options.themePackagePath = path.join(this._options.themePath, THEME_PACKAGE_FILENAME);
	}

	get router(): express.Router {
		return this._router;
	}

	constructor(options: ThemeOptions) {
		this.options = options;

		this._router = express.Router();

		this.getThemes((err, themes) => {
			debug("themes", themes);
		});

		this._router.use((req, res, next) => {
			debug('Time:', Date.now());
			next();
		});

		this._router.get('/', (req, res, next) => {
			res.render('index', { title: 'Express' });
		});

		/* GET users listing. */
		this._router.get('/users', (req, res, next) => {
			res.send('respond with a resource');
		});
	}

	/**
	 * Get all valid themes from theme path
	 */
	private getThemes(callback: getDirsCallback) {
		this.getDirs(this._options.themesPath, (error, dirs) => {
			if (error) {
				debug("error", error);
				return callback(error);
			}
			debug("getThemes dirs", dirs);

			async.filter(dirs, (dir, callback) => {
				this.getThemePackage(path.join(this._options.themesPath, dir), (err, packageObj) => {
					if (err && err !== null) {
						debug("error", err);
						return callback(false);
					}
					return callback(true);
				});
			}, (results) => {
				callback(null, results);
			});
		});
	}

	/**
	 * Get theme packageObj of theme dir
	 */
	private getThemePackage(dir: string, callback: themePackageCallback) {
		var packagePath = path.join(dir, THEME_PACKAGE_FILENAME);
		fs.stat(packagePath, (err, stat) => {
			if (err && err !== null) {
				debug("error", err);
				return callback(err);
			}

			if (!stat.isFile()) {
				return callback(new Error(packagePath + " is not a file!"));
			}


			fs.readJson(packagePath, (err: Error, packageObj: themePackage) => {
				if (err && err !== null) {
					debug("error", err);
					return callback(err);
				}

				if(!_.isString(packageObj.version) || !_.isString(packageObj.name)) {
					return callback(new Error("theme package file broken!"));
				}

				callback(null, packageObj);
			});

		});
	}

	/**
	 * Get all directories within directory
	 * @see http://stackoverflow.com/a/18112359/1465919
	 */
	private getDirs(rootDir: string, cb: getDirsCallback): any {
		debug(rootDir);
		fs.readdir(rootDir, (err: Error, files: string[]) => {
			var dirs: string[] = [];
			if (err && err !== null) {
				debug("error", err);
				return cb(err);
			}
			async.map<string, string>(files, (file, callback) => {
				if (file[0] === '.') {
					return callback(null, null);
				}
				var filePath = rootDir + '/' + file;
				fs.stat(filePath, (err, stat) => {
					if (err && err !== null) {
						return cb(err);
					}
					if (stat.isDirectory()) {
						return callback(null, file);
					}
					return callback(null, null);
				});
			}, (err, results) => {
				if (err && err !== null) {
					return cb(err);
				}
				async.filter(results, (file, callback) => {
					callback(file !== null);
				}, (results) => {
					cb(err, results);
				});
				
			});
		});
	}

}
