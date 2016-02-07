import * as express from 'express';
import * as fs from 'fs-extra';
import * as async from 'async';
import * as path from 'path';
import * as _ from 'lodash';
import * as debugModule from 'debug';
var debug = debugModule("theme");

const THEME_PACKAGE_FILENAME = "bower.json";
const THEME_ASSETS_DIRNAME = "assets";

export interface ThemeOptions {
	/**
	 * themes folder name
	 */
	themes: string;
	/**
	 * current theme name
	 */
	theme: string;
}

interface ThemePackage {
	name: string;
	description?: string;
	version: string;
}

interface ThemeRequestObject {
	name: string;
	path: string;
	packagePath: string;
	package: ThemePackage;
	assetsPath: string;
}

interface ThemePackageCallback {
	(
		error?: Error,
		packageObj?: ThemePackage
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

interface Requeset extends express.Request {
	theme: ThemeRequestObject
}

export class Theme {
	private _router: express.Router;
	private _options: ThemeOptions;

	set options(options: ThemeOptions) {
		this._options = options;
	}

	get router(): express.Router {
		return this._router;
	}

	constructor(options: ThemeOptions) {
		this.options = options;

		this._router = express.Router();

		// get infos for theme(s)
		this._router.use((req, res, next) => {

			var themesPath = path.join(req.app.get('views'), this._options.themes);

			this.getThemes(themesPath, (err, themes) => {
				debug("themes", themes);
			});

			var themeName = this._options.theme;
			var themePath = path.join(req.app.get('views'), this._options.themes, themeName);
			var themePackagePath = path.join(themePath, THEME_PACKAGE_FILENAME);
			var themeAssetsPath = path.join(themePath, THEME_ASSETS_DIRNAME)

			fs.readJson(themePackagePath, (err: Error, themePackage: ThemePackage) => {
				if(err && err !== null) {
					debug(err);
					return next(err);
				}
				var theme:ThemeRequestObject = {
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
		this._router.use((req: Requeset, res, next) => {
			this._router.use(express.static(req.theme.assetsPath));
			next();
		});

		

		// render view in theme
		this._router.use((req: Requeset, res, next) => {

			debug(req.path);
			var renderFilePath = path.join(req.theme.path, req.path + '.jade');

			fs.stat(renderFilePath, (err, stat) => {
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

		this._router.get('/', (req, res, next) => {
			res.render(path.join(req['theme'].path, 'index'), { title: 'Express' });
		});
	}

	/**
	 * Get all valid themes from theme path
	 */
	private getThemes(themesPath: string, callback: getDirsCallback) {
		this.getDirs(themesPath, (error, dirs) => {
			if (error) {
				debug("error", error);
				return callback(error);
			}
			debug("getThemes dirs", dirs);

			async.filter(dirs, (dir, callback) => {
				this.getThemePackage(path.join(themesPath, dir), (err, packageObj) => {
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
	private getThemePackage(dir: string, callback: ThemePackageCallback) {
		var packagePath = path.join(dir, THEME_PACKAGE_FILENAME);
		fs.stat(packagePath, (err, stat) => {
			if (err && err !== null) {
				debug("error", err);
				return callback(err);
			}

			if (!stat.isFile()) {
				return callback(new Error(packagePath + " is not a file!"));
			}

			fs.readJson(packagePath, (err: Error, packageObj: ThemePackage) => {
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
